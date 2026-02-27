import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import Swal from 'sweetalert2';
import { Depense } from '../../core/models/models';

@Component({
  selector: 'app-depenses',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './depenses.component.html',
  styleUrl: './depenses.component.css'
})
export class DepensesComponent implements OnInit {
  depenses$ = new BehaviorSubject<Depense[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalMois$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedDepenses$ = new BehaviorSubject<Depense[]>([]);

  categoriesDepense = ['كراء', 'فواتير', 'نقل', 'مشتريات', 'صيانة', 'أخرى'];
  form = { id: '', description: '', montant: 0, categorie: '', date: '' };

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const depenses = await this.supabase.getDepenses();
      this.depenses$.next(depenses);
      const now = new Date();
      const total = depenses
        .filter((d: any) => { const date = new Date(d.date); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); })
        .reduce((s: number, d: any) => s + Number(d.montant), 0);
      this.totalMois$.next(total);
      this.currentPage = 1;
      this.paginate();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  paginate() {
    const all = this.depenses$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedDepenses$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', description: '', montant: 0, categorie: '', date: new Date().toISOString().split('T')[0] };
    this.showModal = true;
  }

  openEdit(d: Depense) {
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
        await this.supabase.updateDepense(this.form.id, data);
        this.showToast('تعدل بنجاح ✅', 'success');
      } else {
        await this.supabase.addDepense(data);
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(d: Depense) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد المصروف?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteDepense(d.id);
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
