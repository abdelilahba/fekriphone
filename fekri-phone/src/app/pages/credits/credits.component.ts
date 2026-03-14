import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Credit } from '../../core/models/models';

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
  editMode = false;
  filterPaye = 'non_paye';
  selectedDate: string = new Date().toISOString().split('T')[0];
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedCredits$ = new BehaviorSubject<Credit[]>([]);

  form = { id: '', nom_client: '', telephone_client: '', description: '', montant: 0, montant_paye: 0, date: '' };
  payForm = { id: '', montant_a_payer: 0, reste: 0 };
  
  private currentUserId: string | null = null;
  private userRole: string = 'employee';

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { 
    this.auth.user$.subscribe(user => {
      this.currentUserId = user ? user.id : null;
    });
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
      this.loadData(); 
    });
  }

  async loadData() {
    try {
      this.loading$.next(true);
      // Admin gets all credits, employee gets only theirs
      const userIdToFetch = this.userRole === 'admin' ? undefined : (this.currentUserId || undefined);
      this.allCredits = await this.supabase.getCredits(userIdToFetch);
      const total = this.allCredits.filter(c => !c.est_paye).reduce((s, c) => s + (Number(c.montant) - Number(c.montant_paye)), 0);
      this.totalNonPaye$.next(total);
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

    if (this.selectedDate) {
      result = result.filter(c => (c.date.split(' ')[0] || c.date) === this.selectedDate);
    }

    this.filteredCredits$.next(result);
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
    this.form = { id: '', nom_client: '', telephone_client: '', description: '', montant: 0, montant_paye: 0, date: new Date().toISOString().split('T')[0] };
    this.showModal = true;
  }

  openEdit(c: Credit) {
    this.editMode = true;
    this.form = { id: c.id, nom_client: c.nom_client, telephone_client: c.telephone_client || '', description: c.description, montant: c.montant, montant_paye: c.montant_paye, date: c.date };
    this.showModal = true;
  }

  openPay(c: Credit) {
    const reste = Number(c.montant) - Number(c.montant_paye);
    this.payForm = { id: c.id, montant_a_payer: reste, reste };
    this.showPayModal = true;
  }

  closeModal() { this.showModal = false; }
  closePayModal() { this.showPayModal = false; }

  async save() {
    if (!this.form.nom_client || !this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الإسم والوصف والمبلغ', 'error');
      return;
    }
    try {
      const data: any = {
        nom_client: this.form.nom_client, telephone_client: this.form.telephone_client || null,
        description: this.form.description, montant: this.form.montant, montant_paye: this.form.montant_paye,
        est_paye: this.form.montant_paye >= this.form.montant, date: this.form.date
      };
      if (this.editMode) {
        await this.supabase.updateCredit(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        await this.supabase.addCredit(data, this.currentUserId || undefined);
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async pay() {
    try {
      const credit = this.allCredits.find(c => c.id === this.payForm.id);
      if (!credit) return;
      const newPaye = Number(credit.montant_paye) + Number(this.payForm.montant_a_payer);
      await this.supabase.updateCredit(this.payForm.id, { montant_paye: newPaye, est_paye: newPaye >= Number(credit.montant) });
      this.showToast('تخلص بنجاح ✅', 'success');
      this.closePayModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
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
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  getReste(c: Credit): number { return Number(c.montant) - Number(c.montant_paye); }
  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
