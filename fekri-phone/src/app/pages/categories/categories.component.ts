import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import Swal from 'sweetalert2';
import { Categorie } from '../../core/models/models';

import { CATEGORY_ICONS, resolveCategoryImage } from '../../core/models/category-icons';

@Component({
  selector: 'app-categories',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './categories.component.html',
  styleUrl: './categories.component.css'
})
export class CategoriesComponent implements OnInit {
  categories$ = new BehaviorSubject<Categorie[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showModal = false;
  editMode = false;
  form = { id: '', nom: '', icone: 'assets/categories/other.png' };

  iconOptions = CATEGORY_ICONS; // Using our new professional images

  // Utility to expose logic to template
  readonly resolveImg = resolveCategoryImage;

  constructor(private supabase: SupabaseService) { }

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const cats = await this.supabase.getCategories();
      this.categories$.next(cats);
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  openAdd() { this.editMode = false; this.form = { id: '', nom: '', icone: '📦' }; this.showModal = true; }
  openEdit(c: Categorie) { this.editMode = true; this.form = { id: c.id, nom: c.nom, icone: c.icone || '📦' }; this.showModal = true; }
  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.nom) { this.showToast('خصك تدخل الإسم', 'error'); return; }
    try {
      if (this.editMode) {
        await this.supabase.updateCategorie(this.form.id, this.form.nom, this.form.icone);
        this.showToast('تعدلت الفئة ✅', 'success');
      } else {
        await this.supabase.addCategorie(this.form.nom, this.form.icone);
        this.showToast('تزادت الفئة ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  async delete(c: Categorie) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: `بغيتي تمسح "${c.nom}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليها'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteCategorie(c.id);
      this.showToast('تمسحت ✅', 'success');
      await this.loadData();
    } catch (error) { this.showToast('ما قدرش تتمسح، عندها منتجات', 'error'); }
  }

  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}