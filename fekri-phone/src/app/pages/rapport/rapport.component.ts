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

  exportPDF() {
    const report = this.today$.value;
    if (!report) return;

    const html = `
    <html dir="rtl"><head><meta charset="utf-8">
    <style>
      * { font-family: 'Cairo', 'Segoe UI', sans-serif; direction: rtl; }
      body { padding: 30px; color: #1e1b3a; }
      h1 { text-align: center; color: #9b30ff; font-size: 28px; margin-bottom: 4px; }
      .subtitle { text-align: center; color: #888; font-size: 14px; margin-bottom: 24px; }
      .date-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; background: #f3f0ff; padding: 12px; border-radius: 8px; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      th { background: #9b30ff; color: white; padding: 10px 16px; text-align: right; font-size: 14px; }
      td { padding: 10px 16px; border-bottom: 1px solid #eee; font-size: 14px; }
      tr:nth-child(even) { background: #f9f9f9; }
      .total-row { background: #f3f0ff !important; font-weight: 900; font-size: 16px; }
      .positive { color: #16a34a; }
      .negative { color: #dc2626; }
      .footer { text-align: center; margin-top: 30px; color: #aaa; font-size: 12px; }
    </style></head><body>
    <div style="text-align: center; margin-bottom: 10px;">
      <img src="assets/logo.jpg" alt="Fikri Phone" style="max-height: 80px; border-radius: 8px;">
    </div>
    <div class="subtitle">تقرير يومي — إدارة المحل</div>
    <div class="date-title">📅 ${report.dateLabel}</div>

    <table>
      <thead><tr><th>البند</th><th>العدد</th><th>المبلغ</th></tr></thead>
      <tbody>
        <tr><td>🛒 المبيعات</td><td>${report.ventesCount}</td><td>${this.formatMAD(report.ventesTotal)}</td></tr>
        <tr><td>💰 ربح المبيعات</td><td>—</td><td class="positive">${this.formatMAD(report.ventesProfitTotal)}</td></tr>
        <tr><td>🔧 الإصلاحات</td><td>${report.reparationsCount}</td><td>${this.formatMAD(report.reparationsTotal)}</td></tr>
        <tr><td>💸 المصاريف</td><td>${report.depensesCount}</td><td class="negative">${this.formatMAD(report.depensesTotal)}</td></tr>
        <tr><td>📝 الديون</td><td>${report.creditsCount}</td><td>${this.formatMAD(report.creditsTotal)}</td></tr>
        <tr class="total-row"><td>📈 الربح الصافي</td><td></td><td class="${report.benefice >= 0 ? 'positive' : 'negative'}">${this.formatMAD(report.benefice)}</td></tr>
        <tr class="total-row"><td>💵 الفلوس فالصندوق</td><td></td><td>${this.formatMAD(report.caisse)}</td></tr>
      </tbody>
    </table>

    <div class="footer">تقرير تم إنشاؤه أوتوماتيكياً من تطبيق إدارة المحل — ${new Date().toLocaleString('ar-MA')}</div>
    </body></html>`;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  }

  exportExcel() {
    const report = this.today$.value;
    if (!report) return;

    // Build CSV content
    let csv = '\uFEFF'; // BOM for Arabic support in Excel
    csv += 'تقرير يوم,' + report.dateLabel + '\n\n';

    // Summary
    csv += 'البند,العدد,المبلغ\n';
    csv += 'المبيعات,' + report.ventesCount + ',' + report.ventesTotal + '\n';
    csv += 'ربح المبيعات,—,' + report.ventesProfitTotal + '\n';
    csv += 'الإصلاحات,' + report.reparationsCount + ',' + report.reparationsTotal + '\n';
    csv += 'المصاريف,' + report.depensesCount + ',' + report.depensesTotal + '\n';
    csv += 'الديون,' + report.creditsCount + ',' + report.creditsTotal + '\n';
    csv += 'الربح الصافي,,' + report.benefice + '\n';
    csv += 'الفلوس فالصندوق,,' + report.caisse + '\n\n';

    // Ventes detail
    if (report.ventesList.length > 0) {
      csv += '--- تفاصيل البيعات ---\n';
      csv += '#,المبلغ,الربح\n';
      report.ventesList.forEach((v: any, i: number) => {
        csv += (i + 1) + ',' + v.montant_total + ',' + (v.profit_total || 0) + '\n';
      });
      csv += '\n';
    }

    // Reparations detail
    if (report.reparationsList.length > 0) {
      csv += '--- تفاصيل الإصلاحات ---\n';
      csv += '#,الوصف,المبلغ\n';
      report.reparationsList.forEach((r: any, i: number) => {
        csv += (i + 1) + ',"' + r.description + '",' + r.montant + '\n';
      });
      csv += '\n';
    }

    // Depenses detail
    if (report.depensesList.length > 0) {
      csv += '--- تفاصيل المصاريف ---\n';
      csv += '#,الوصف,النوع,المبلغ\n';
      report.depensesList.forEach((d: any, i: number) => {
        csv += (i + 1) + ',"' + d.description + '",' + (d.categorie || '') + ',' + d.montant + '\n';
      });
      csv += '\n';
    }

    // Credits detail
    if (report.creditsList.length > 0) {
      csv += '--- تفاصيل الديون ---\n';
      csv += '#,الزبون,الوصف,المبلغ\n';
      report.creditsList.forEach((c: any, i: number) => {
        csv += (i + 1) + ',"' + c.nom_client + '","' + c.description + '",' + c.montant + '\n';
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rapport_' + report.date + '.csv';
    link.click();
    URL.revokeObjectURL(url);
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
