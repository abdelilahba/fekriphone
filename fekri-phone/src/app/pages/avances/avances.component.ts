import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Avance } from '../../core/models/models';

@Component({
  selector: 'app-avances',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './avances.component.html',
  styleUrl: './avances.component.css'
})
export class AvancesComponent implements OnInit {
  avances$ = new BehaviorSubject<Avance[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalJour$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  selectedDate: string = new Date().toISOString().split('T')[0];
  allAvancesData: Avance[] = [];
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedAvances$ = new BehaviorSubject<Avance[]>([]);

  categoriesAvance = ['تسبيق إصلاح (عربون)', 'تسبيق بيع', 'أخرى'];
  form = { id: '', description: '', montant: 0, categorie: '', date: '' };

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      this.allAvancesData = await this.supabase.getAvances();
      this.applyFilters();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  applyFilters() {
    let filtered = this.allAvancesData;
    if (this.selectedDate) {
      filtered = filtered.filter(a => a.date === this.selectedDate);
    }
    this.avances$.next(filtered);

    const total = filtered.reduce((s: number, a: any) => s + Number(a.montant), 0);
    this.totalJour$.next(total);
    this.currentPage = 1;
    this.paginate();
  }

  paginate() {
    const all = this.avances$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedAvances$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', description: '', montant: 0, categorie: '', date: new Date().toISOString().split('T')[0] };
    this.showModal = true;
  }

  openEdit(d: Avance) {
    this.editMode = true;
    this.form = { id: d.id, description: d.description, montant: d.montant, categorie: d.categorie || '', date: d.date };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الوصف والمبلغ', 'error');
      return;
    }
    try {
      const data = { description: this.form.description, montant: this.form.montant, categorie: this.form.categorie || null, date: this.form.date };
      if (this.editMode) {
        await this.supabase.updateAvance(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        const uid = this.auth.currentUser?.id;
        await this.supabase.addAvance(data, uid);
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(d: Avance) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد الدفعة?',
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
      await this.supabase.deleteAvance(d.id, uid);
      this.showToast('تمسح ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
