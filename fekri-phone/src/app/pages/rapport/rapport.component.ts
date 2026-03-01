import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';

interface DayReport {
  date: string;
  dateLabel: string;
  ventesCount: number;
  ventesTotal: number;
  ventesProfitTotal: number;
  reparationsCount: number;
  reparationsTotal: number;
  depensesCount: number;
  depensesTotal: number;
  creditsCount: number;
  creditsTotal: number;
  benefice: number;
  caisse: number;
  ventesList: any[];
  reparationsList: any[];
  depensesList: any[];
  creditsList: any[];
}

@Component({
  selector: 'app-rapport',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rapport.component.html',
  styleUrl: './rapport.component.css'
})
export class RapportComponent implements OnInit {
  today$ = new BehaviorSubject<DayReport | null>(null);
  yesterday$ = new BehaviorSubject<DayReport | null>(null);
  loading$ = new BehaviorSubject<boolean>(true);
  selectedDate: string = '';
  activeTab: 'ventes' | 'reparations' | 'depenses' | 'credits' = 'ventes';

  constructor(private supabase: SupabaseService) { }

  ngOnInit() {
    this.selectedDate = this.formatDate(new Date());
    this.loadReport();
  }

  async loadReport() {
    this.loading$.next(true);
    try {
      const selected = new Date(this.selectedDate);
      const prev = new Date(selected);
      prev.setDate(prev.getDate() - 1);

      const [todayReport, yesterdayReport] = await Promise.all([
        this.buildDayReport(selected),
        this.buildDayReport(prev)
      ]);
      this.today$.next(todayReport);
      this.yesterday$.next(yesterdayReport);
    } catch (e) {
      console.error(e);
    } finally {
      this.loading$.next(false);
    }
  }

  private async buildDayReport(date: Date): Promise<DayReport> {
    const dateStr = this.formatDate(date);
    const [ventes, revenus, depenses, credits] = await Promise.all([
      this.supabase.getVentes(),
      this.supabase.getRevenus(),
      this.supabase.getDepenses(),
      this.supabase.getCredits()
    ]);

    const dayVentes = ventes.filter((v: any) => v.date === dateStr);
    const dayRevenus = revenus.filter((r: any) => r.date === dateStr);
    const dayDepenses = depenses.filter((d: any) => d.date === dateStr);
    const dayCredits = credits.filter((c: any) => c.date === dateStr);

    const ventesTotal = dayVentes.reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    const ventesProfitTotal = dayVentes.reduce((s: number, v: any) => s + Number(v.profit_total || 0), 0);
    const reparationsTotal = dayRevenus.reduce((s: number, r: any) => s + Number(r.montant || 0), 0);
    const depensesTotal = dayDepenses.reduce((s: number, d: any) => s + Number(d.montant || 0), 0);
    const creditsTotal = dayCredits.reduce((s: number, c: any) => s + Number(c.montant || 0), 0);

    return {
      date: dateStr,
      dateLabel: this.getDateLabel(date),
      ventesCount: dayVentes.length,
      ventesTotal,
      ventesProfitTotal,
      reparationsCount: dayRevenus.length,
      reparationsTotal,
      depensesCount: dayDepenses.length,
      depensesTotal,
      creditsCount: dayCredits.length,
      creditsTotal,
      benefice: ventesProfitTotal + reparationsTotal - depensesTotal,
      caisse: ventesTotal + reparationsTotal - depensesTotal,
      ventesList: dayVentes,
      reparationsList: dayRevenus,
      depensesList: dayDepenses,
      creditsList: dayCredits
    };
  }

  onDateChange() {
    this.loadReport();
  }

  goToday() {
    this.selectedDate = this.formatDate(new Date());
    this.loadReport();
  }

  goYesterday() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    this.selectedDate = this.formatDate(d);
    this.loadReport();
  }

  getDiff(today: number, yesterday: number): number {
    return today - yesterday;
  }

  getDiffPercent(today: number, yesterday: number): string {
    if (yesterday === 0) return today > 0 ? '+∞' : '—';
    const pct = ((today - yesterday) / yesterday) * 100;
    return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
  }

  printReport() {
    window.print();
  }

  formatMAD(a: number): string {
    return Number(a).toLocaleString('ar-MA') + ' د.م';
  }

  private formatDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  private getDateLabel(d: Date): string {
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    return days[d.getDay()] + ' ' + d.toLocaleDateString('ar-MA');
  }
}
