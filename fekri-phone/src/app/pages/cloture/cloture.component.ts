import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule } from '@angular/router';
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
    private route: ActivatedRoute
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
      // Use the catch-up date if provided, otherwise use normal working date
      const today = this.catchUpDate ?? DateUtils.getWorkingDate();

      // Get daily stats
      const stats = await this.supabase.getDailyQuickStats();

      // Get individual totals for display
      const [ventes, revenus, depenses, avances, paiements, creditsCash] = await Promise.all([
        this.supabase['supabase'].from('ventes').select('montant_total, montant_paye').eq('date', today),
        this.supabase['supabase'].from('revenus_reparation').select('montant').eq('date', today),
        this.supabase['supabase'].from('depenses').select('montant').eq('date', today),
        this.supabase['supabase'].from('avances').select('montant').eq('date', today),
        this.supabase['supabase'].from('credit_paiements').select('montant').eq('date', today),
        this.supabase['supabase'].from('credits').select('montant').eq('date', today).eq('type_credit', 'cash')
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
      this.avancesTotal = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
      this.depensesTotal = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
      this.paiementsTotal = (paiements.data || []).reduce((s: number, p: any) => s + Number(p.montant || 0), 0);
      this.creditsCashTotal = (creditsCash.data || []).reduce((s: number, c: any) => s + Number(c.montant || 0), 0);
      this.montantTheorique = stats.caisse;

      // Check if already closed today
      const { data: existing } = await this.supabase['supabase']
        .from('clotures_caisse')
        .select('*')
        .eq('date', today)
        .limit(1);

      this.alreadyClosed = !!(existing && existing.length > 0);
      if (this.alreadyClosed) {
        this.todayCloture = existing![0];
        this.isInPreviousDayMode = DateUtils.isInPreviousDayMode();
      }

      // Load history
      const { data: hist } = await this.supabase['supabase']
        .from('clotures_caisse')
        .select('*, profiles!user_id(name)')
        .order('date', { ascending: false })
        .limit(30);
      this.historique = hist || [];

    } catch (error) {
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
}
