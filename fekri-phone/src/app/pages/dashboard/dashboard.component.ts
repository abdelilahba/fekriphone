import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

interface DashboardStats {
  totalProduits: number;
  totalVentes: number;
  totalRevenusReparation: number;
  totalDepenses: number;
  totalCreditsEnCours: number;
  benefice: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  @ViewChild('revenueChart') revenueChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pieChart') pieChartRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('barChart') barChartRef!: ElementRef<HTMLCanvasElement>;

  stats$ = new BehaviorSubject<DashboardStats>({
    totalProduits: 0, totalVentes: 0, totalRevenusReparation: 0,
    totalDepenses: 0, totalCreditsEnCours: 0, benefice: 0
  });
  loading$ = new BehaviorSubject<boolean>(true);
  chartReady = false;

  // Computed values for display
  ventesCount = 0;
  reparationsCount = 0;
  beneficePercent = 0;
  topProduits: { nom: string, qty: number, icone: string }[] = [];

  private charts: Chart[] = [];

  constructor(private supabase: SupabaseService) { }

  ngOnInit() { this.loadStats(); }
  ngAfterViewInit() { this.chartReady = true; }

  async loadStats() {
    try {
      this.loading$.next(true);
      const [stats, ventes, depenses, revenus, produits] = await Promise.all([
        this.supabase.getDashboardStats(),
        this.supabase.getVentes(),
        this.supabase.getDepenses(),
        this.supabase.getRevenus(),
        this.supabase.getProduits()
      ]);
      this.stats$.next(stats);

      this.ventesCount = ventes.length;
      this.reparationsCount = revenus.length;
      const totalIn = stats.totalVentes + stats.totalRevenusReparation;
      this.beneficePercent = totalIn > 0 ? Math.round((stats.benefice / totalIn) * 100) : 0;

      // Extract top 5 products from vente_items
      const productSales = new Map<string, { qty: number, nom: string, icone: string }>();
      ventes.forEach((v: any) => {
        if (v.vente_items && Array.isArray(v.vente_items)) {
          v.vente_items.forEach((item: any) => {
            const pid = item.produit_id;
            if (pid) {
              const p = produits.find((pr: any) => pr.id === pid);
              if (!productSales.has(pid)) {
                productSales.set(pid, { qty: 0, nom: p?.nom || 'منتج محذوف (أو قديم)', icone: p?.categorie_icone || '📦' });
              }
              productSales.get(pid)!.qty += item.quantite;
            }
          });
        }
      });

      this.topProduits = Array.from(productSales.values())
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5);

      setTimeout(() => this.buildCharts(ventes, depenses, revenus, stats), 300);
    } catch (error) {
      console.error('خطأ:', error);
    } finally {
      this.loading$.next(false);
    }
  }

  private buildCharts(ventes: any[], depenses: any[], revenus: any[], stats: DashboardStats) {
    this.charts.forEach(c => c.destroy());
    this.charts = [];

    this.buildLineChart(ventes, depenses, revenus);
    this.buildPieChart(stats);
    this.buildBarChart(ventes, depenses, revenus);
  }

  // ========== LINE: Monthly Trends ==========
  private buildLineChart(ventes: any[], depenses: any[], revenus: any[]) {
    if (!this.revenueChartRef) return;
    const ctx = this.revenueChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const months = this.getLast6Months();
    const labels = months.map(m => this.getMonthName(m.month));
    const ventesData = months.map(m => this.sumByMonth(ventes, 'montant_total', m.year, m.month));
    const ventesProfitData = months.map(m => this.sumByMonth(ventes, 'profit_total', m.year, m.month));
    const revenusData = months.map(m => this.sumByMonth(revenus, 'montant', m.year, m.month));
    const depensesData = months.map(m => this.sumByMonth(depenses, 'montant', m.year, m.month));
    const beneficeData = months.map((m, i) => ventesProfitData[i] + revenusData[i] - depensesData[i]);

    const chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: '💰 الربح الصافي (Bénéfice Net)',
            data: beneficeData,
            borderColor: '#9b30ff',
            backgroundColor: 'rgba(155, 48, 255, 0.08)',
            fill: true, tension: 0.4, borderWidth: 3,
            pointRadius: 6, pointBackgroundColor: '#9b30ff',
            pointBorderColor: '#fff', pointBorderWidth: 2,
          },
          {
            label: '🛒 إجمالي المبيعات (Chiffre d\'Affaires)',
            data: ventesData,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.05)',
            fill: true, tension: 0.4, borderWidth: 2,
            pointRadius: 4, pointBackgroundColor: '#22c55e',
          },
          {
            label: '💸 المصاريف (Dépenses)',
            data: depensesData,
            borderColor: '#ef4444',
            backgroundColor: 'rgba(239, 68, 68, 0.05)',
            fill: true, tension: 0.4, borderWidth: 2,
            borderDash: [5, 5],
            pointRadius: 4, pointBackgroundColor: '#ef4444',
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Cairo', size: 12, weight: 'bold' as any }, usePointStyle: true, padding: 16 } },
          tooltip: {
            backgroundColor: '#1e1b3a', titleFont: { family: 'Cairo', weight: 'bold' as any }, bodyFont: { family: 'Cairo' },
            padding: 12, cornerRadius: 8,
            callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString('ar-MA')} د.م` }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'Cairo', size: 11 }, callback: (v: any) => (v / 1000).toFixed(0) + 'K' }, grid: { color: 'rgba(155,48,255,0.05)' } },
          x: { ticks: { font: { family: 'Cairo', weight: 'bold' as any, size: 12 } }, grid: { display: false } }
        },
        interaction: { intersect: false, mode: 'index' as const }
      }
    });
    this.charts.push(chart);
  }

  // ========== PIE: Revenue Breakdown ==========
  private buildPieChart(stats: DashboardStats) {
    if (!this.pieChartRef) return;
    const ctx = this.pieChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['🛒 المبيعات', '🔧 الإصلاحات', '💸 المصاريف', '📝 الديون'],
        datasets: [{
          data: [stats.totalVentes, stats.totalRevenusReparation, stats.totalDepenses, stats.totalCreditsEnCours],
          backgroundColor: ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b'],
          borderWidth: 3, borderColor: '#ffffff',
          hoverOffset: 8,
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        cutout: '60%',
        plugins: {
          legend: { position: 'bottom', labels: { font: { family: 'Cairo', size: 12, weight: 'bold' as any }, padding: 16, usePointStyle: true } },
          tooltip: {
            backgroundColor: '#1e1b3a', titleFont: { family: 'Cairo', weight: 'bold' as any }, bodyFont: { family: 'Cairo' },
            padding: 12, cornerRadius: 8,
            callbacks: { label: (ctx: any) => `${ctx.label}: ${Number(ctx.parsed).toLocaleString('ar-MA')} د.م` }
          }
        }
      }
    });
    this.charts.push(chart);
  }

  // ========== BAR: Monthly Comparison ==========
  private buildBarChart(ventes: any[], depenses: any[], revenus: any[]) {
    if (!this.barChartRef) return;
    const ctx = this.barChartRef.nativeElement.getContext('2d');
    if (!ctx) return;

    const months = this.getLast6Months();
    const labels = months.map(m => this.getMonthName(m.month));
    const ventesData = months.map(m => this.sumByMonth(ventes, 'montant_total', m.year, m.month));
    const revenusData = months.map(m => this.sumByMonth(revenus, 'montant', m.year, m.month));
    const depensesData = months.map(m => this.sumByMonth(depenses, 'montant', m.year, m.month));

    const chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: '🛒 مبيعات', data: ventesData, backgroundColor: '#22c55e', borderRadius: 6, barPercentage: 0.7 },
          { label: '🔧 إصلاحات', data: revenusData, backgroundColor: '#3b82f6', borderRadius: 6, barPercentage: 0.7 },
          { label: '💸 مصاريف', data: depensesData, backgroundColor: '#ef4444', borderRadius: 6, barPercentage: 0.7 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { font: { family: 'Cairo', size: 12, weight: 'bold' as any }, usePointStyle: true, padding: 16 } },
          tooltip: {
            backgroundColor: '#1e1b3a', titleFont: { family: 'Cairo', weight: 'bold' as any }, bodyFont: { family: 'Cairo' },
            padding: 12, cornerRadius: 8,
            callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString('ar-MA')} د.م` }
          }
        },
        scales: {
          y: { beginAtZero: true, ticks: { font: { family: 'Cairo', size: 11 }, callback: (v: any) => (v / 1000).toFixed(0) + 'K' }, grid: { color: 'rgba(155,48,255,0.05)' } },
          x: { ticks: { font: { family: 'Cairo', weight: 'bold' as any, size: 12 } }, grid: { display: false } }
        }
      }
    });
    this.charts.push(chart);
  }

  // ========== Helpers ==========
  private getLast6Months(): { year: number; month: number }[] {
    const result = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      result.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return result;
  }

  private sumByMonth(items: any[], field: string, year: number, month: number): number {
    return items
      .filter((item: any) => { const d = new Date(item.date || item.created_at); return d.getFullYear() === year && d.getMonth() === month; })
      .reduce((sum: number, item: any) => sum + Number(item[field] || 0), 0);
  }

  private getMonthName(m: number): string {
    const names = ['يناير', 'فبراير', 'مارس', 'أبريل', 'ماي', 'يونيو', 'يوليوز', 'غشت', 'شتنبر', 'أكتوبر', 'نونبر', 'دجنبر'];
    return names[m] || '';
  }

  formatMAD(amount: number): string {
    return Number(amount).toLocaleString('ar-MA') + ' د.م';
  }
}
