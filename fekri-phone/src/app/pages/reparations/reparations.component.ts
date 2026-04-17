import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { RevenuReparation, Client, Credit } from '../../core/models/models';

@Component({
  selector: 'app-reparations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reparations.component.html',
  styleUrl: './reparations.component.css'
})
export class ReparationsComponent implements OnInit {
  revenus$ = new BehaviorSubject<RevenuReparation[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalMois$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedRevenus$ = new BehaviorSubject<RevenuReparation[]>([]);
  userRole = 'admin';
  selectedDate: string = new Date().toISOString().split('T')[0];
  allRevenusData: RevenuReparation[] = [];

  // Credit fields
  isCredit = false;
  montantPaye: number | null = null;
  nomClient = '';
  clients: Client[] = [];
  filteredClients: Client[] = [];

  // Credit info map: key = description|date, value = credit info
  creditMap: Map<string, { nom_client: string; montant: number; montant_paye: number; est_paye: boolean }> = new Map();

  form = { id: '', description: '', montant: 0, date: '' };

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { 
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
    });
    this.loadData();
    this.loadClients();
    this.loadCreditsForRepairs();
  }

  async loadClients() {
    try {
      this.clients = await this.supabase.getClients();
    } catch {}
  }

  filterClients() {
    if (!this.nomClient || this.nomClient.trim().length < 1) {
      this.filteredClients = [];
      return;
    }
    const q = this.nomClient.toLowerCase();
    this.filteredClients = this.clients.filter(c => c.nom.toLowerCase().includes(q)).slice(0, 5);
  }

  selectClient(c: Client) {
    this.nomClient = c.nom;
    this.filteredClients = [];
  }

  get resteCredit(): number {
    const montant = this.form.montant || 0;
    const paye = this.montantPaye ?? montant;
    return Math.max(0, montant - paye);
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const revenus = await this.supabase.getRevenus();
      
      let finalRevenus = revenus;
      if (this.userRole !== 'admin') {
        const uid = this.auth.currentUser?.id;
        finalRevenus = revenus.filter((r: any) => r.user_id === uid);
      }

      this.allRevenusData = finalRevenus;
      this.filterByDate();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  filterByDate() {
    let filtered = this.allRevenusData;
    if (this.selectedDate) {
      filtered = filtered.filter(r => (r.date.split(' ')[0] || r.date) === this.selectedDate);
    }
    this.revenus$.next(filtered);

    const total = filtered.reduce((s: number, r: any) => s + Number(r.montant), 0);
    this.totalMois$.next(total);
    this.currentPage = 1;
    this.paginate();
  }

  paginate() {
    const all = this.revenus$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedRevenus$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', description: '', montant: 0, date: new Date().toISOString().split('T')[0] };
    this.isCredit = false;
    this.montantPaye = null;
    this.nomClient = '';
    this.filteredClients = [];
    this.showModal = true;
  }

  openEdit(r: RevenuReparation) {
    this.editMode = true;
    this.form = { id: r.id, description: r.description, montant: r.montant, date: r.date };
    this.isCredit = false;
    this.montantPaye = null;
    this.nomClient = '';
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الوصف والمبلغ', 'error');
      return;
    }
    if (this.isCredit && !this.nomClient.trim()) {
      this.showToast('خصك تدخل اسم الزبون للكريدي', 'error');
      return;
    }
    try {
      const data = { description: this.form.description, montant: this.form.montant, date: this.form.date };
      const uid = this.auth.currentUser?.id;
      if (this.editMode) {
        await this.supabase.updateRevenu(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        await this.supabase.addRevenu(data, uid);

        // Create credit if partial/no payment
        if (this.isCredit && this.resteCredit > 0) {
          let client = this.clients.find(c => c.nom.toLowerCase() === this.nomClient.trim().toLowerCase());
          let clientId = client ? client.id : null;

          if (!clientId) {
            const newClient = await this.supabase.addClient({ nom: this.nomClient.trim() });
            clientId = newClient.id;
          }

          await this.supabase.addCredit({
            client_id: clientId,
            nom_client: this.nomClient.trim(),
            description: 'إصلاح: ' + this.form.description,
            montant: this.resteCredit,
            montant_paye: 0,
            est_paye: false,
            date: this.form.date || new Date().toISOString().split('T')[0]
          }, uid);
        }

        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
      await this.loadClients();
      await this.loadCreditsForRepairs();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(r: RevenuReparation) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد الإصلاح?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      const uid = this.auth.currentUser?.id;
      await this.supabase.deleteRevenu(r.id, uid);
      this.showToast('تمسح ✅', 'success');
      await this.loadData();
      await this.loadCreditsForRepairs();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  // Load credits linked to repairs (matched by 'إصلاح:' prefix)
  async loadCreditsForRepairs() {
    try {
      const allCredits: Credit[] = await this.supabase.getCredits();
      this.creditMap.clear();
      for (const credit of allCredits) {
        if (credit.description && credit.description.startsWith('إصلاح: ')) {
          const repairDesc = credit.description.replace('إصلاح: ', '');
          const dateKey = (credit.date || '').split(' ')[0] || credit.date;
          const key = repairDesc + '|' + dateKey;
          this.creditMap.set(key, {
            nom_client: credit.nom_client,
            montant: credit.montant,
            montant_paye: credit.montant_paye,
            est_paye: credit.est_paye
          });
        }
      }
    } catch (e) {
      console.error('Error loading credits for repairs', e);
    }
  }

  getCreditInfo(r: RevenuReparation): { nom_client: string; montant: number; montant_paye: number; est_paye: boolean } | null {
    const dateKey = (r.date || '').split(' ')[0] || r.date;
    const key = r.description + '|' + dateKey;
    return this.creditMap.get(key) || null;
  }

  getCreditReste(info: { montant: number; montant_paye: number }): number {
    return Math.max(0, Number(info.montant) - Number(info.montant_paye));
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
