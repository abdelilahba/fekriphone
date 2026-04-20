import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Credit, Client } from '../../core/models/models';
import { DateUtils } from '../../core/utils/date.utils';

@Component({
  selector: 'app-credits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './credits.component.html',
  styleUrl: './credits.component.css'
})
export class CreditsComponent implements OnInit {
  private allCredits: Credit[] = [];
  filteredCredits$ = new BehaviorSubject<Credit[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalNonPaye$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  showPayModal = false;
  showHistoryModal = false;
  editMode = false;
  filterPaye = 'non_paye';
  selectedDate: string = '';
  selectedClientId: string = '';
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedCredits$ = new BehaviorSubject<Credit[]>([]);

  allClients: Client[] = [];
  creditHistory: any[] = [];

  form = { id: '', client_id: '', nom_client: '', telephone_client: '', description: '', montant: 0, montant_paye: 0, type_credit: 'produit' as 'produit' | 'cash', date: '' };
  payForm = { id: '', montant_a_payer: 0, reste: 0, date: '' };

  private currentUserId: string | null = null;
  private userRole: string = 'employee';

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  async ngOnInit() {
    this.auth.user$.subscribe(user => {
      this.currentUserId = user ? user.id : null;
    });
    this.auth.userRole$.subscribe(async role => {
      this.userRole = role;
      await this.loadClients();
      await this.loadData();
    });
  }

  async loadClients() {
    try {
      this.allClients = await this.supabase.getClients();
    } catch (e) {
      console.error('Error loading clients', e);
    }
  }

  async loadData() {
    try {
      this.loading$.next(true);
      // All users (admin + employee) see all credits — credits are client-facing data
      const credits = await this.supabase.getCredits();
      this.allCredits = credits;
      this.applyFilter();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  applyFilter() {
    let result: Credit[];
    if (this.filterPaye === 'non_paye') result = this.allCredits.filter(c => !c.est_paye);
    else if (this.filterPaye === 'paye') result = this.allCredits.filter(c => c.est_paye);
    else result = [...this.allCredits];

    if (this.selectedClientId) {
      result = result.filter(c => c.client_id === this.selectedClientId);
    }

    if (this.selectedDate) {
      result = result.filter(c => (c.date.split(' ')[0] || c.date) === this.selectedDate);
    }

    this.filteredCredits$.next(result);
    this.totalNonPaye$.next(result.filter(c => !c.est_paye).reduce((s, c) => s + (Number(c.montant) - Number(c.montant_paye)), 0));

    this.currentPage = 1;
    this.paginate(result);
  }

  paginate(items?: Credit[]) {
    const all = items || this.filteredCredits$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedCredits$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', client_id: '', nom_client: '', telephone_client: '', description: '', montant: 0, montant_paye: 0, type_credit: 'produit', date: DateUtils.getWorkingDate() };
    this.showModal = true;
  }

  openEdit(c: Credit) {
    this.editMode = true;
    this.form = {
      id: c.id,
      client_id: c.client_id || '',
      nom_client: c.nom_client,
      telephone_client: c.telephone_client || '',
      description: c.description,
      montant: c.montant,
      montant_paye: c.montant_paye,
      type_credit: (c.type_credit === 'vente' ? 'produit' : c.type_credit || 'produit') as 'produit' | 'cash',
      date: c.date
    };
    this.showModal = true;
  }

  openPay(c: Credit) {
    const reste = Number(c.montant) - Number(c.montant_paye);
    this.payForm = { id: c.id, montant_a_payer: reste, reste, date: DateUtils.getWorkingDate() };
    this.showPayModal = true;
  }

  async openHistory(c: Credit) {
    try {
      this.creditHistory = await this.supabase.getCreditPaiements(c.id);
      this.showHistoryModal = true;
    } catch (error) {
      this.showToast('خطأ فالتحميل ديال التاريخ', 'error');
    }
  }

  // Removed onClientChange since we use datalist and auto-create

  closeModal() { this.showModal = false; }
  closePayModal() { this.showPayModal = false; }
  closeHistoryModal() { this.showHistoryModal = false; }

  async save() {
    if (!this.form.nom_client || !this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الزبون والوصف والمبلغ', 'error');
      return;
    }
    try {
      let finalClientId = this.form.client_id || null;
      let existingClient = this.allClients.find(c => c.nom.toLowerCase() === this.form.nom_client.trim().toLowerCase());

      if (existingClient) {
        finalClientId = existingClient.id;
      } else {
        const newClient = await this.supabase.addClient({
          nom: this.form.nom_client.trim(),
          telephone: this.form.telephone_client || null
        });
        finalClientId = newClient.id;
      }

      const data: any = {
        client_id: finalClientId,
        nom_client: this.form.nom_client.trim(),
        telephone_client: this.form.telephone_client,
        description: this.form.description,
        montant: this.form.montant,
        montant_paye: this.form.montant_paye,
        type_credit: this.form.type_credit as string,
        est_paye: Number(this.form.montant_paye) >= Number(this.form.montant),
        date: this.form.date
      };

      if (this.editMode) {
        await this.supabase.updateCredit(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        await this.supabase.addCredit(data, this.currentUserId || undefined);
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadClients();
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  async pay() {
    try {
      const credit = this.allCredits.find(c => c.id === this.payForm.id);
      if (!credit) return;

      const nouveauMontant = Number(credit.montant_paye) + Number(this.payForm.montant_a_payer);

      await this.supabase.addPaiement(this.payForm.id, Number(this.payForm.montant_a_payer), this.payForm.date);

      await this.supabase.updateCredit(this.payForm.id, {
        montant_paye: nouveauMontant,
        est_paye: nouveauMontant >= credit.montant
      });

      this.showToast('تخلص بنجاح ✅', 'success');
      this.closePayModal();
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  sendWhatsApp(c: Credit) {
    if (!c.telephone_client) {
      this.showToast('ما كاينش نمرة التليفون', 'error');
      return;
    }
    const reste = this.getReste(c);
    // Clean description: replace || with readable format
    let desc = c.description || '';
    if (desc.includes('||')) {
      const parsed = this.parseDescription(desc);
      desc = parsed.header + ': ' + parsed.items.join(' و ');
    }
    const message = `السلام عليكم ${c.nom_client}, بغيت نفكرك فالدين اللي بيناتنا (${desc}). الباقي هو ${reste} د.م. شكرا.`;
    const url = `https://wa.me/212${c.telephone_client.replace(/^0/, '')}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  }

  async delete(c: Credit) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: `بغيتي تمسح دين "${c.nom_client}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteCredit(c.id);
      this.showToast('تمسح ✅', 'success');
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  getReste(c: Credit): number { return Number(c.montant) - Number(c.montant_paye); }

  /**
   * Parse credit description into header + product badges.
   * New format: "باقي من ثمن||1x product1||2x product2"
   * Legacy format: "باقي من ثمن 1x product1 و 1x product2" (plain text)
   */
  parseDescription(desc: string): { header: string; items: string[] } {
    if (!desc) return { header: '', items: [] };
    if (desc.includes('||')) {
      const parts = desc.split('||').map(s => s.trim()).filter(s => s.length > 0);
      const header = parts[0];
      const items = parts.slice(1);
      return { header, items };
    }
    // Legacy: no separator, return as plain text
    return { header: desc, items: [] };
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
