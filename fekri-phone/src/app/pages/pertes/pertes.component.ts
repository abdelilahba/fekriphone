import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import Swal from 'sweetalert2';
import { Perte } from '../../core/models/models';

@Component({
  selector: 'app-pertes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pertes.component.html',
  styleUrl: './pertes.component.css'
})
export class PertesComponent implements OnInit {
  pertes$ = new BehaviorSubject<Perte[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalMois$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedPertes$ = new BehaviorSubject<Perte[]>([]);

  raisonsPertes = ['منتج مكسور', 'تيليفون معطل', 'شاشة مكسورة', 'عيب المصنع', 'ضرر أثناء النقل', 'أخرى'];
  form = { id: '', produit_nom: '', description: '', montant_perte: 0, quantite: 1, raison: '', date: '' };

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const pertes = await this.supabase.getPertes();
      this.pertes$.next(pertes);
      const now = new Date();
      const total = pertes
        .filter((p: any) => { const date = new Date(p.date); return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear(); })
        .reduce((s: number, p: any) => s + Number(p.montant_perte), 0);
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
    const all = this.pertes$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedPertes$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', produit_nom: '', description: '', montant_perte: 0, quantite: 1, raison: '', date: new Date().toISOString().split('T')[0] };
    this.showModal = true;
  }

  openEdit(p: Perte) {
    this.editMode = true;
    this.form = { id: p.id, produit_nom: p.produit_nom, description: p.description || '', montant_perte: p.montant_perte, quantite: p.quantite, raison: p.raison || '', date: p.date };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.produit_nom || !this.form.montant_perte) {
      this.showToast('خصك تدخل اسم المنتج والمبلغ', 'error');
      return;
    }
    try {
      const data = {
        produit_nom: this.form.produit_nom,
        description: this.form.description || null,
        montant_perte: this.form.montant_perte,
        quantite: this.form.quantite,
        raison: this.form.raison || 'منتج مكسور',
        date: this.form.date
      };
      if (this.editMode) {
        await this.supabase.updatePerte(this.form.id, data);
        this.showToast('تعدلات بنجاح ✅', 'success');
      } else {
        await this.supabase.addPerte(data);
        this.showToast('تسجلات بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(p: Perte) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد الخسارة?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deletePerte(p.id);
      this.showToast('تمسحات ✅', 'success');
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
