import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-cloture',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

  // Form
  montantReel: number | null = null;
  note = '';
  ecart = 0;
  showResult = false;

  // History
  historique: any[] = [];
  showHistorique = false;

  // State
  alreadyClosed = false;
  todayCloture: any = null;

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const today = new Date().toISOString().split('T')[0];

      // Get daily stats
      const stats = await this.supabase.getDailyQuickStats();

      // Get individual totals for display
      const [ventes, revenus, depenses, avances] = await Promise.all([
        this.supabase['supabase'].from('ventes').select('montant_total, montant_paye').eq('date', today),
        this.supabase['supabase'].from('revenus_reparation').select('montant').eq('date', today),
        this.supabase['supabase'].from('depenses').select('montant').eq('date', today),
        this.supabase['supabase'].from('avances').select('montant').eq('date', today)
      ]);

      this.ventesTotal = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
      this.reparationsTotal = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
      this.avancesTotal = (avances.data || []).reduce((s: number, a: any) => s + Number(a.montant || 0), 0);
      this.depensesTotal = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
      this.montantTheorique = stats.caisse;

      // Check if already closed today
      const { data: existing } = await this.supabase['supabase']
        .from('clotures_caisse')
        .select('*')
        .eq('date', today)
        .limit(1);

      if (existing && existing.length > 0) {
        this.alreadyClosed = true;
        this.todayCloture = existing[0];
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
      const today = new Date().toISOString().split('T')[0];

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

      this.showToast('تم إقفال الصندوق بنجاح ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل فالحفظ', 'error');
    }
  }

  toggleHistorique() {
    this.showHistorique = !this.showHistorique;
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('ar-MA', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' });
  }

  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
