import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { DateUtils } from '../../core/utils/date.utils';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-cloture',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './cloture.component.html',
  styleUrl: './cloture.component.css'
})
export class ClotureComponent implements OnInit {
  loading$ = new BehaviorSubject<boolean>(true);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);

  // Stats
  ventesTotal = 0;
  reparationsTotal = 0;
  avancesTotal = 0;
  depensesTotal = 0;
  montantTheorique = 0;
  ventesCash = 0;
  ventesCredit = 0;
  paiementsTotal = 0;
  creditsCashTotal = 0;

  // Form
  montantReel: number | null = null;
  note = '';
  ecart = 0;
  showResult = false;
  showCaissePopup = false;

  // History
  historique: any[] = [];
  showHistorique = false;

  // Unclosed days
  unclosedDays: { date: string; label: string; caisse: number }[] = [];

  // State
  alreadyClosed = false;
  todayCloture: any = null;
  isInPreviousDayMode = false;

  // Catch-up mode: closing a specific past missed day
  catchUpDate: string | null = null;
  catchUpDateLabel = '';

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit() {
    // Check if we're in catch-up mode (closing a past missed day)
    this.route.queryParams.subscribe(params => {
      if (params['date']) {
        this.catchUpDate = params['date'];
        this.catchUpDateLabel = new Date(this.catchUpDate + 'T12:00:00').toLocaleDateString('ar-MA', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
      }
      this.loadData();
    });
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const today = this.catchUpDate ?? DateUtils.getWorkingDate();

      // Single Promise.all — no separate getDailyQuickStats() call
      // to avoid doubling the number of round-trips to Supabase.
      const [ventes, revenus, depenses, avances, paiements, creditsCash, existing, hist] = await Promise.all([
        this.supabase['supabase'].from('ventes').select('montant_total, montant_paye').eq('date', today),
        this.supabase['supabase'].from('revenus_reparation').select('montant').eq('date', today),
        this.supabase['supabase'].from('depenses').select('montant').eq('date', today),
        this.supabase['supabase'].from('avances').select('montant').eq('date', today),
        this.supabase['supabase'].from('credit_paiements').select('montant').eq('date', today),
        this.supabase['supabase'].from('credits').select('montant').eq('date', today).eq('type_credit', 'cash'),
        this.supabase['supabase'].from('clotures_caisse').select('*').eq('date', today).limit(1),
        this.supabase['supabase'].from('clotures_caisse')
          .select('*, profiles!user_id(name)')
          .order('date', { ascending: false })
          .limit(30)
      ]);

      let ventesTotalCash = 0;
      let ventesTotalCredit = 0;

      (ventes.data || []).forEach((v: any) => {
        const montant = Number(v.montant_total || 0);
        const paye = (v.montant_paye !== undefined && v.montant_paye !== null) ? Number(v.montant_paye) : montant;
        ventesTotalCash += paye;
        ventesTotalCredit += (montant - paye);
      });

      this.ventesTotal = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
      this.ventesCash = ventesTotalCash;
      this.ventesCredit = ventesTotalCredit;

      this.reparationsTotal = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
      this.avancesTotal     = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
      this.depensesTotal    = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
      this.paiementsTotal   = (paiements.data || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0);
      this.creditsCashTotal = (creditsCash.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);

      // Compute caisse directly — no extra network call
      this.montantTheorique =
        ventesTotalCash +
        this.reparationsTotal +
        this.avancesTotal +
        this.paiementsTotal -
        this.depensesTotal -
        this.creditsCashTotal;

      // Already closed?
      this.alreadyClosed = !!(existing.data && existing.data.length > 0);
      if (this.alreadyClosed) {
        this.todayCloture = existing.data![0];
        this.isInPreviousDayMode = DateUtils.isInPreviousDayMode();
      }

      this.historique = hist.data || [];

      // Load unclosed days (last 7 days only to avoid 504 timeouts)
      await this.loadUnclosedDays();

    } catch (error) {
      console.error('Cloture loadData error:', error);
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  calculateEcart() {
    if (this.montantReel !== null) {
      this.ecart = this.montantReel - this.montantTheorique;
      this.showResult = true;
    }
  }

  async submitCloture() {
    if (this.montantReel === null) {
      this.showToast('خصك تدخل المبلغ اللي لقيتي فالصندوق', 'error');
      return;
    }

    const ecartAbs = Math.abs(this.ecart);
    const ecartType = this.ecart < 0 ? 'نقص ❌' : this.ecart > 0 ? 'زيادة ✅' : 'مقاد 100% ✅';

    const result = await Swal.fire({
      title: 'تأكيد إقفال الصندوق',
      html: `
        <div style="text-align: right; font-size: 15px; line-height: 2;">
          <p>💰 <b>الحساب النظري:</b> ${this.formatMAD(this.montantTheorique)}</p>
          <p>🏦 <b>الفلوس الحقيقية:</b> ${this.formatMAD(this.montantReel)}</p>
          <p>${this.ecart === 0 ? '✅' : '⚠️'} <b>الفرق:</b> ${this.formatMAD(this.ecart)} (${ecartType})</p>
          ${this.note ? `<p>📝 <b>الملاحظة:</b> ${this.note}</p>` : ''}
        </div>
      `,
      icon: this.ecart === 0 ? 'success' : 'warning',
      showCancelButton: true,
      confirmButtonColor: this.ecart === 0 ? '#10b981' : '#f59e0b',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🔒 سد الصندوق',
      cancelButtonText: 'إلغاء'
    });

    if (!result.isConfirmed) return;

    try {
      const uid = this.auth.currentUser?.id;
      // Use catch-up date if in catch-up mode, otherwise use normal working date
      const today = this.catchUpDate ?? DateUtils.getWorkingDate();

      // Insert cloture
      const { error } = await this.supabase['supabase']
        .from('clotures_caisse')
        .insert({
          date: today,
          montant_theorique: this.montantTheorique,
          montant_reel: this.montantReel,
          ecart: this.ecart,
          note: this.note || null,
          user_id: uid
        });
      if (error) throw error;

      // Log activity & send Telegram notification
      await this.supabase.logActivity('CLOTURE_CAISSE', {
        montant_theorique: this.montantTheorique,
        montant_reel: this.montantReel,
        ecart: this.ecart,
        note: this.note
      }, uid);

      // Send the daily recap report to Telegram (before switching to next day)
      await this.supabase.sendDailyRecapTelegram(today, {
        montant_theorique: this.montantTheorique,
        montant_reel: this.montantReel!,
        ecart: this.ecart,
        note: this.note || undefined
      });

      // Only mark localStorage as closed if it's the actual working date (not a catch-up)
      if (!this.catchUpDate) {
        DateUtils.setClosed();
      } else {
        // Mark the catch-up date as closed in localStorage too
        localStorage.setItem(`cloture_${this.catchUpDate}`, 'true');
      }

      this.showToast('تم إقفال الصندوق بنجاح ✅', 'success');

      if (this.catchUpDate) {
        // After closing a past day, show a success message with option to continue
        setTimeout(async () => {
          await Swal.fire({
            title: '✅ تسد بنجاح!',
            html: `
              <div style="text-align:right; direction:rtl; line-height:2; font-size:15px;">
                <p>تسد صندوق <b>${this.catchUpDateLabel}</b> بنجاح! 🎉</p>
                <p style="color:#6b7280; font-size:13px;">دابا تقدر تكمل فاليوم الجديد بلا مشكل.</p>
              </div>
            `,
            icon: 'success',
            confirmButtonText: '🏠 رجوع للرئيسية',
            confirmButtonColor: '#10b981',
            allowOutsideClick: false
          });
          // Navigate to home after closing past day
          window.location.href = '/';
        }, 800);
      } else {
        // Normal flow: reload to refresh all dates
        setTimeout(() => window.location.reload(), 1500);
      }
    } catch (error) {
      this.showToast('وقع مشكل فالحفظ', 'error');
    }
  }

  toggleHistorique() {
    this.showHistorique = !this.showHistorique;
  }

  toggleCaissePopup() {
    this.showCaissePopup = !this.showCaissePopup;
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('ar-MA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  }

  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }

  async toggleDayMode() {
    if (this.isInPreviousDayMode) {
      DateUtils.clearPreviousDayMode();
    } else {
      const result = await Swal.fire({
        title: 'الرجوع لليوم السابق؟',
        text: 'بينما نتا فاليوم السابق، أي حاجة غاتقيد غاتمشي للحساب ديال هاد النهار لي سديتي.',
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'أيه، نرجع لليوم السابق',
        cancelButtonText: 'لا، خليني فاليوم الجديد',
        confirmButtonColor: '#10b981'
      });
      if (result.isConfirmed) {
        DateUtils.setPreviousDayMode();
      } else {
        return;
      }
    }
    this.isInPreviousDayMode = DateUtils.isInPreviousDayMode();
    this.showToast('تم تغيير وضع التاريخ بنجاح ✅', 'success');
    setTimeout(() => window.location.reload(), 1000);
  }

  /** Load the last 7 days and find which ones have no cloture.
   *  Limited to 7 days (not 30) to avoid 504 Gateway Timeout on Supabase. */
  private async loadUnclosedDays() {
    try {
      const dates: string[] = [];
      for (let i = 1; i <= 7; i++) {
        const d = new Date();
        const tzDate = new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Casablanca' }));
        tzDate.setDate(tzDate.getDate() - i);
        const pad = (n: number) => n.toString().padStart(2, '0');
        dates.push(`${tzDate.getFullYear()}-${pad(tzDate.getMonth() + 1)}-${pad(tzDate.getDate())}`);
      }

      // Get all clotures for those dates
      const { data: closedData } = await this.supabase['supabase']
        .from('clotures_caisse')
        .select('date')
        .in('date', dates);

      const closedSet = new Set((closedData || []).map((r: any) => r.date));

      // Fetch all transactions for these dates in one round-trip per table
      const [ventesData, repData, depData, avancesData, creditsCashData, paiementsData] = await Promise.all([
        this.supabase['supabase'].from('ventes').select('date, montant_paye').in('date', dates),
        this.supabase['supabase'].from('revenus_reparation').select('date, montant').in('date', dates),
        this.supabase['supabase'].from('depenses').select('date, montant').in('date', dates),
        this.supabase['supabase'].from('avances').select('date, montant').in('date', dates),
        this.supabase['supabase'].from('credits').select('date, montant').in('date', dates).eq('type_credit', 'cash'),
        this.supabase['supabase'].from('credit_paiements').select('date, montant').in('date', dates)
      ]);

      // Build a caisse map per date
      const sumByDate = (rows: any[], field: string) => {
        const map = new Map<string, number>();
        (rows || []).forEach((r: any) => {
          map.set(r.date, (map.get(r.date) || 0) + Number(r[field] || 0));
        });
        return map;
      };

      const ventesMap   = sumByDate(ventesData.data || [], 'montant_paye');
      const repMap      = sumByDate(repData.data || [], 'montant');
      const depMap      = sumByDate(depData.data || [], 'montant');
      const avancesMap  = sumByDate(avancesData.data || [], 'montant');
      const creditsMap  = sumByDate(creditsCashData.data || [], 'montant');
      const paiementsMap = sumByDate(paiementsData.data || [], 'montant');

      // Active dates = any date with at least some transaction
      const activeDates = new Set<string>();
      [ventesMap, repMap, depMap, avancesMap].forEach(m => m.forEach((v, k) => { if (v > 0) activeDates.add(k); }));

      // Unclosed = has activity but no cloture
      this.unclosedDays = dates
        .filter(d => activeDates.has(d) && !closedSet.has(d))
        .map(d => {
          const caisse = (ventesMap.get(d) || 0)
            + (repMap.get(d) || 0)
            + (avancesMap.get(d) || 0)
            + (paiementsMap.get(d) || 0)
            - (depMap.get(d) || 0)
            - (creditsMap.get(d) || 0);
          return {
            date: d,
            label: new Date(d + 'T12:00:00').toLocaleDateString('ar-MA', {
              weekday: 'long', day: 'numeric', month: 'long'
            }),
            caisse
          };
        });
    } catch (e) {
      // Non-critical: unclosed days is a convenience feature, don't crash the page
      console.warn('loadUnclosedDays error (non-critical):', e);
      this.unclosedDays = [];
    }
  }

  goToCatchUp(dateStr: string) {
    this.router.navigate(['/cloture'], { queryParams: { date: dateStr } });
    setTimeout(() => window.location.reload(), 200);
  }
}
