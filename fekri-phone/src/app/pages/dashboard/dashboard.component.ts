import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import { Chart, registerables } from 'chart.js';
import Swal from 'sweetalert2';

Chart.register(...registerables);

interface DashboardStats {
  totalProduits: number;
  totalVentes: number;
  totalRevenusReparation: number;
  totalDepenses: number;
  totalCreditsEnCours: number;
  totalPertes?: number;
  benefice: number;
}

interface SmartAlert {
  type: 'danger' | 'warning' | 'success' | 'info';
  icon: string;
  title: string;
  message: string;
  link?: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
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
  userRole = 'admin';

  // Computed values for display
  ventesCount = 0;
  reparationsCount = 0;
  beneficePercent = 0;
  topProduits: { nom: string, qty: number, icone: string }[] = [];
  alerts: SmartAlert[] = [];
  alertsDismissed = false;

  // Comparison data
  comparison: {
    label: string;
    thisMonth: number;
    lastMonth: number;
    diff: number;
    pct: string;
    icon: string;
    color: string;
  }[] = [];
  thisMonthLabel = '';
  lastMonthLabel = '';

  // Stock predictions
  stockPredictions: {
    nom: string; icone: string; stock: number;
    ventesParMois: number; joursRestants: number;
    status: 'danger' | 'warning' | 'safe';
    statusLabel: string;
  }[] = [];
  private charts: Chart[] = [];

  constructor(private supabase: SupabaseService, private auth: AuthService) { }

  ngOnInit() { 
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
    });
    this.loadStats(); 
    this.showUpdateMessage();
  }
  
  private async showUpdateMessage() {
    const seen = localStorage.getItem('update_msg_v1_1_seen');
    if (!seen) {
      setTimeout(async () => {
        await Swal.fire({
          title: '🎉 تحديث جديد في التطبيق!',
          html: `
            <div style="text-align: right; line-height: 1.8; font-size: 15px;">
              <b>شنو الجديد؟</b><br>
              1️⃣ <b>الكريدي فالمبيعات:</b> دابا ملي تبيع شي حاجة، تقدر تكتب شحال عطاك الكليان بالضبط فـ (المبلغ المؤدى)، والباقي غيتسجل كريدي أوتوماتيكيا!<br>
              2️⃣ <b>تسجيل الكليان أوتوماتيك:</b> ملي تبغي تقيد كريدي (سواء فالبيع ولا فصفحة الديون)، يكفي تكتب سميت الكليان. الا ماكانش مسجل غيتسجل بوحدو بلا ما تمشي تزيدو بيدك.<br>
              3️⃣ <b>الحساب د الكاصة مقاد:</b> دابا الكاصة (الفوق) كتحسب غير الفلوس الكاش لي دخلات بصح باش ميوقعش غلط مع الكريدي!
            </div>
          `,
          icon: 'info',
          confirmButtonText: 'فهمت، شكرا! 👍',
          confirmButtonColor: '#9b30ff'
        });
        localStorage.setItem('update_msg_v1_1_seen', 'true');
      }, 1000); // 1-second delay so it pops up after loading
    }
  }

  ngAfterViewInit() { this.chartReady = true; }

  async loadStats() {
    try {
      this.loading$.next(true);
      const [stats, ventes, depenses, revenus, produits, pertes, credits] = await Promise.all([
        this.supabase.getDashboardStats(),
        this.supabase.getVentes(),
        this.supabase.getDepenses(),
        this.supabase.getRevenus(),
        this.supabase.getProduits(),
        this.supabase.getPertes(),
        this.supabase.getCredits()
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

      this.generateAlerts(produits, ventes, depenses, pertes, credits, stats);
      this.buildComparison(ventes, depenses, revenus, pertes);
      this.buildStockPredictions(produits, ventes);
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

  // ========== Stock Predictions ==========
  private buildStockPredictions(produits: any[], ventes: any[]) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Count sales per product in the last 30 days
    const salesCount = new Map<string, number>();
    ventes.forEach((v: any) => {
      const vDate = new Date(v.date || v.created_at);
      if (vDate >= thirtyDaysAgo && v.vente_items && Array.isArray(v.vente_items)) {
        v.vente_items.forEach((item: any) => {
          const pid = item.produit_id;
          if (pid) {
            salesCount.set(pid, (salesCount.get(pid) || 0) + item.quantite);
          }
        });
      }
    });

    // Build predictions for all products
    const predictions = produits.map((p: any) => {
      const ventesMois = salesCount.get(p.id) || 0;
      const ventesParJour = ventesMois / 30;
      const joursRestants = ventesParJour > 0 ? Math.round(p.quantite / ventesParJour) : (p.quantite > 0 ? 999 : 0);

      let status: 'danger' | 'warning' | 'safe' = 'safe';
      let statusLabel = '🟢 مرتاح';
      if (p.quantite <= 0) {
        status = 'danger'; statusLabel = '🔴 خلاص!';
      } else if (joursRestants <= 7) {
        status = 'danger'; statusLabel = '🔴 طلب دابا!';
      } else if (joursRestants <= 30) {
        status = 'warning'; statusLabel = '🟡 طلب قريباً';
      }

      return {
        nom: p.nom, icone: p.categorie_icone || '📦',
        stock: p.quantite, ventesParMois: ventesMois,
        joursRestants, status, statusLabel
      };
    });

    // Sort: danger first, then warning, then safe. Within each, sort by days remaining
    this.stockPredictions = predictions
      .sort((a, b) => {
        const order = { danger: 0, warning: 1, safe: 2 };
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
        return a.joursRestants - b.joursRestants;
      })
      .slice(0, 10); // Show top 10
  }

  // ========== Monthly Comparison ==========
  private buildComparison(ventes: any[], depenses: any[], revenus: any[], pertes: any[]) {
    const now = new Date();
    const thisM = now.getMonth();
    const thisY = now.getFullYear();
    const lastDate = new Date(thisY, thisM - 1, 1);
    const lastM = lastDate.getMonth();
    const lastY = lastDate.getFullYear();

    this.thisMonthLabel = this.getMonthName(thisM);
    this.lastMonthLabel = this.getMonthName(lastM);

    const calcPct = (curr: number, prev: number): string => {
      if (prev === 0) return curr > 0 ? '+∞' : '—';
      const pct = ((curr - prev) / prev) * 100;
      return (pct >= 0 ? '+' : '') + pct.toFixed(0) + '%';
    };

    const ventesThis = this.sumByMonth(ventes, 'montant_total', thisY, thisM);
    const ventesLast = this.sumByMonth(ventes, 'montant_total', lastY, lastM);
    const profitThis = this.sumByMonth(ventes, 'profit_total', thisY, thisM);
    const profitLast = this.sumByMonth(ventes, 'profit_total', lastY, lastM);
    const repThis = this.sumByMonth(revenus, 'montant', thisY, thisM);
    const repLast = this.sumByMonth(revenus, 'montant', lastY, lastM);
    const depThis = this.sumByMonth(depenses, 'montant', thisY, thisM);
    const depLast = this.sumByMonth(depenses, 'montant', lastY, lastM);
    const pertesThis = this.sumByMonth(pertes, 'montant_perte', thisY, thisM);
    const pertesLast = this.sumByMonth(pertes, 'montant_perte', lastY, lastM);
    const benefThis = profitThis + repThis - depThis - pertesThis;
    const benefLast = profitLast + repLast - depLast - pertesLast;

    this.comparison = [
      { label: '🛒 المبيعات', thisMonth: ventesThis, lastMonth: ventesLast, diff: ventesThis - ventesLast, pct: calcPct(ventesThis, ventesLast), icon: '🛒', color: ventesThis >= ventesLast ? '#16a34a' : '#dc2626' },
      { label: '💰 ربح المبيعات', thisMonth: profitThis, lastMonth: profitLast, diff: profitThis - profitLast, pct: calcPct(profitThis, profitLast), icon: '💰', color: profitThis >= profitLast ? '#16a34a' : '#dc2626' },
      { label: '🔧 الإصلاحات', thisMonth: repThis, lastMonth: repLast, diff: repThis - repLast, pct: calcPct(repThis, repLast), icon: '🔧', color: repThis >= repLast ? '#16a34a' : '#dc2626' },
      { label: '💸 المصاريف', thisMonth: depThis, lastMonth: depLast, diff: depThis - depLast, pct: calcPct(depThis, depLast), icon: '💸', color: depThis <= depLast ? '#16a34a' : '#dc2626' },
      { label: '💔 الخسائر', thisMonth: pertesThis, lastMonth: pertesLast, diff: pertesThis - pertesLast, pct: calcPct(pertesThis, pertesLast), icon: '💔', color: pertesThis <= pertesLast ? '#16a34a' : '#dc2626' },
      { label: '📈 الربح الصافي', thisMonth: benefThis, lastMonth: benefLast, diff: benefThis - benefLast, pct: calcPct(benefThis, benefLast), icon: '📈', color: benefThis >= benefLast ? '#16a34a' : '#dc2626' },
    ];
  }

  // ========== Smart Alerts ==========
  private generateAlerts(produits: any[], ventes: any[], depenses: any[], pertes: any[], credits: any[], stats: DashboardStats) {
    const alerts: SmartAlert[] = [];
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const lastMonthDate = new Date(thisYear, thisMonth - 1, 1);
    const lastMonth = lastMonthDate.getMonth();
    const lastMonthYear = lastMonthDate.getFullYear();

    // 0. Prix manquants (prix_vente = 0 ou prix_achat = 0)
    const missingPrixVente = produits.filter((p: any) => Number(p.prix_vente) === 0);
    const missingPrixAchat = produits.filter((p: any) => Number(p.prix_achat) === 0);
    if (missingPrixVente.length > 0) {
      alerts.push({
        type: 'danger', icon: '🏷️',
        title: missingPrixVente.length + ' منتج ناقصه ثمن البيع!',
        message: missingPrixVente.slice(0, 3).map((p: any) => p.nom).join('، ') + (missingPrixVente.length > 3 ? ' ...' : '') + ' — خصك تدخل الثمن باش تقدر تبيع!',
        link: '/produits'
      });
    }
    if (missingPrixAchat.length > 0) {
      alerts.push({
        type: 'warning', icon: '💰',
        title: missingPrixAchat.length + ' منتج ناقصه ثمن الشراء!',
        message: missingPrixAchat.slice(0, 3).map((p: any) => p.nom).join('، ') + (missingPrixAchat.length > 3 ? ' ...' : '') + ' — بلا ثمن الشراء الربح مش صحيح!',
        link: '/produits'
      });
    }

    // 1. Stock critique
    const lowStock = produits.filter((p: any) => p.quantite <= 2 && p.quantite > 0);
    const outOfStock = produits.filter((p: any) => p.quantite <= 0);
    if (outOfStock.length > 0) {
      alerts.push({
        type: 'danger', icon: '🚨',
        title: outOfStock.length + ' منتجات خلاو من المخزون!',
        message: outOfStock.slice(0, 3).map((p: any) => p.nom).join('، ') + (outOfStock.length > 3 ? ' ...' : ''),
        link: '/produits'
      });
    }
    if (lowStock.length > 0) {
      alerts.push({
        type: 'warning', icon: '📦',
        title: lowStock.length + ' منتجات قربو يخلصو!',
        message: lowStock.slice(0, 3).map((p: any) => p.nom + ' (' + p.quantite + ')').join('، '),
        link: '/produits'
      });
    }

    // 2. Crédits anciens (> 30 jours)
    const oldCredits = credits.filter((c: any) => {
      if (c.est_paye) return false;
      const days = Math.floor((now.getTime() - new Date(c.date).getTime()) / (1000 * 60 * 60 * 24));
      return days > 30;
    });
    if (oldCredits.length > 0) {
      const totalOld = oldCredits.reduce((s: number, c: any) => s + (Number(c.montant) - Number(c.montant_paye)), 0);
      alerts.push({
        type: 'warning', icon: '⏰',
        title: oldCredits.length + ' ديون فايتين 30 يوم!',
        message: this.formatMAD(totalOld) + ' — خصك تتصل بالزبناء: ' + oldCredits.slice(0, 2).map((c: any) => c.nom_client).join('، '),
        link: '/credits'
      });
    }

    // 3. Pertes ce mois
    const pertesThisMonth = pertes.filter((p: any) => {
      const d = new Date(p.date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    if (pertesThisMonth.length >= 3) {
      const totalPertes = pertesThisMonth.reduce((s: number, p: any) => s + Number(p.montant_perte), 0);
      alerts.push({
        type: 'danger', icon: '💔',
        title: pertesThisMonth.length + ' منتجات تالفة هاد الشهر!',
        message: this.formatMAD(totalPertes) + ' ضايعة — واش المورد كيبيع سلعة مزيانة؟',
        link: '/pertes'
      });
    }

    // 4. Comparer dépenses ce mois vs mois dernier
    const depThisMonth = depenses.filter((d: any) => { const dt = new Date(d.date); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear; })
      .reduce((s: number, d: any) => s + Number(d.montant), 0);
    const depLastMonth = depenses.filter((d: any) => { const dt = new Date(d.date); return dt.getMonth() === lastMonth && dt.getFullYear() === lastMonthYear; })
      .reduce((s: number, d: any) => s + Number(d.montant), 0);
    if (depLastMonth > 0 && depThisMonth > depLastMonth * 1.5) {
      const pct = Math.round(((depThisMonth - depLastMonth) / depLastMonth) * 100);
      alerts.push({
        type: 'warning', icon: '💸',
        title: 'المصاريف زادو بـ ' + pct + '%!',
        message: this.formatMAD(depThisMonth) + ' هاد الشهر مقارنة بـ ' + this.formatMAD(depLastMonth) + ' الشهر الفايت',
        link: '/depenses'
      });
    }

    // 5. Comparer ventes ce mois vs mois dernier
    const ventesThisMonth = ventes.filter((v: any) => { const d = new Date(v.date || v.created_at); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
      .reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    const ventesLastMonth = ventes.filter((v: any) => { const d = new Date(v.date || v.created_at); return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear; })
      .reduce((s: number, v: any) => s + Number(v.montant_total || 0), 0);
    if (ventesLastMonth > 0 && ventesThisMonth < ventesLastMonth * 0.7) {
      const pct = Math.round(((ventesLastMonth - ventesThisMonth) / ventesLastMonth) * 100);
      alerts.push({
        type: 'danger', icon: '📉',
        title: 'المبيعات نازلين بـ ' + pct + '%!',
        message: this.formatMAD(ventesThisMonth) + ' هاد الشهر مقارنة بـ ' + this.formatMAD(ventesLastMonth) + ' الشهر الفايت',
        link: '/ventes'
      });
    } else if (ventesLastMonth > 0 && ventesThisMonth > ventesLastMonth * 1.2) {
      const pct = Math.round(((ventesThisMonth - ventesLastMonth) / ventesLastMonth) * 100);
      alerts.push({
        type: 'success', icon: '🚀',
        title: 'المبيعات طالعين بـ ' + pct + '%!',
        message: 'كمل هكا! ' + this.formatMAD(ventesThisMonth) + ' هاد الشهر 💪',
        link: '/ventes'
      });
    }

    // 6. Bénéfice positif encouragement
    if (stats.benefice > 0 && alerts.filter(a => a.type === 'danger').length === 0) {
      alerts.push({
        type: 'success', icon: '🎉',
        title: 'الحمد لله، المحل رابح!',
        message: 'الربح الصافي هاد الشهر: ' + this.formatMAD(stats.benefice),
        link: '/rapport'
      });
    }

    this.alerts = alerts;
  }

  dismissAlerts() {
    this.alertsDismissed = true;
  }

  formatMAD(amount: number): string {
    return Number(amount).toLocaleString('ar-MA') + ' د.م';
  }
}
