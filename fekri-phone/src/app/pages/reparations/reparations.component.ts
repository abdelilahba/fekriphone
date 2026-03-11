import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { RevenuReparation } from '../../core/models/models';

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

  form = { id: '', description: '', montant: 0, date: '' };

  constructor(private supabase: SupabaseService, private auth: AuthService) {}

  ngOnInit() { 
    this.auth.userRole$.subscribe(role => {
      this.userRole = role;
    });
    this.loadData(); 
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

      this.revenus$.next(finalRevenus);

      const now = new Date();
      const total = finalRevenus
        .filter((r: any) => { 
          const d = new Date(r.date); 
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); 
        })
        .reduce((s: number, r: any) => s + Number(r.montant), 0);
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
    this.showModal = true;
  }

  openEdit(r: RevenuReparation) {
    this.editMode = true;
    this.form = { id: r.id, description: r.description, montant: r.montant, date: r.date };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.description || !this.form.montant) {
      this.showToast('خصك تدخل الوصف والمبلغ', 'error');
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
        this.showToast('تزاد بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
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
