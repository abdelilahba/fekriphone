import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { Produit, Categorie } from '../../core/models/models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-pieces',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pieces.component.html',
  styleUrl: './pieces.component.css'
})
export class PiecesComponent implements OnInit {
  private allPieces: Produit[] = [];
  private categories: Categorie[] = [];
  filteredPieces$ = new BehaviorSubject<Produit[]>([]);
  paginatedPieces$ = new BehaviorSubject<Produit[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);

  searchTerm = '';
  showModal = false;
  editMode = false;
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;

  // Stock modal
  showStockModal = false;
  stockProduct: Produit | null = null;
  stockNewQty = 0;

  // Detail modal
  showDetailModal = false;
  selectedPiece: Produit | null = null;

  form = {
    id: '', nom: '', categorie_id: '', prix_achat: 0,
    prix_vente: 0, quantite: 0, code_barre: '', description: ''
  };

  // Categories marked as "pieces" (🔧 قطع غيار type)
  pieceCategories: Categorie[] = [];

  constructor(private supabase: SupabaseService) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const [produits, categories] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getCategories()
      ]);
      this.categories = categories;

      // Filter categories that are "pieces" - 🔧 icon or name contains قطع
      this.pieceCategories = categories.filter((c: Categorie) =>
        c.icone === '🔧' || c.nom.includes('قطع') || c.nom.includes('piece') || c.nom.includes('pièce')
      );

      const pieceCatIds = this.pieceCategories.map(c => c.id);

      // Filter products that belong to piece categories
      this.allPieces = produits.filter((p: Produit) => pieceCatIds.includes(p.categorie_id));
      this.applyFilter();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  applyFilter() {
    let result = [...this.allPieces];
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(p =>
        p.nom.toLowerCase().includes(term) ||
        (p.code_barre && p.code_barre.includes(term))
      );
    }
    this.filteredPieces$.next(result);
    this.currentPage = 1;
    this.paginate(result);
  }

  paginate(items?: Produit[]) {
    const all = items || this.filteredPieces$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedPieces$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginate(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  // CRUD
  openAdd() {
    this.editMode = false;
    this.form = {
      id: '', nom: '', categorie_id: this.pieceCategories[0]?.id || '',
      prix_achat: 0, prix_vente: 0, quantite: 0, code_barre: '', description: ''
    };
    this.showModal = true;
  }

  openEdit(p: Produit) {
    this.editMode = true;
    this.form = {
      id: p.id, nom: p.nom, categorie_id: p.categorie_id,
      prix_achat: p.prix_achat, prix_vente: p.prix_vente,
      quantite: p.quantite, code_barre: p.code_barre || '', description: p.description || ''
    };
    this.showModal = true;
  }

  closeModal() { this.showModal = false; }

  async save() {
    if (!this.form.nom) {
      this.showToast('خصك تدخل الإسم', 'error');
      return;
    }
    // Default to first piece category if not set
    if (!this.form.categorie_id && this.pieceCategories.length > 0) {
      this.form.categorie_id = this.pieceCategories[0].id;
    }
    try {
      const data: any = {
        nom: this.form.nom, categorie_id: this.form.categorie_id,
        prix_achat: this.form.prix_achat, prix_vente: this.form.prix_vente,
        quantite: this.form.quantite,
        code_barre: this.form.code_barre || null,
        description: this.form.description || null
      };
      if (this.editMode) {
        await this.supabase.updateProduit(this.form.id, data);
        this.showToast('تعدلت القطعة ✅', 'success');
      } else {
        await this.supabase.addProduit(data);
        this.showToast('تزادت القطعة ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async delete(p: Produit) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: `بغيتي تمسح "${p.nom}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليها'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteProduit(p.id);
      this.showToast('تمسحت ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('ما قدرش يتمسح', 'error');
    }
  }

  // Stock
  openStockModal(p: Produit) {
    this.stockProduct = p;
    this.stockNewQty = p.quantite;
    this.showStockModal = true;
  }
  closeStockModal() { this.showStockModal = false; this.stockProduct = null; }
  adjustStock(delta: number) { this.stockNewQty = Math.max(0, this.stockNewQty + delta); }

  async saveStock() {
    if (!this.stockProduct) return;
    try {
      await this.supabase.updateProduit(this.stockProduct.id, { quantite: this.stockNewQty });
      this.showToast('تبدل المخزن ✅', 'success');
      this.closeStockModal();
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  // Detail
  viewPiece(p: Produit) { this.selectedPiece = p; this.showDetailModal = true; }
  closeDetailModal() { this.showDetailModal = false; this.selectedPiece = null; }

  // Helpers
  getCategoryName(id: string): string {
    return this.categories.find(c => c.id === id)?.nom || '';
  }
  getCategoryIcon(id: string): string {
    return (this.categories.find(c => c.id === id) as any)?.icone || '🔧';
  }
  getStockBadge(q: number): string {
    if (q === 0) return 'danger';
    if (q <= 5) return 'warning';
    return 'success';
  }
  getStockLabel(q: number): string {
    if (q === 0) return 'سالي';
    if (q <= 5) return 'قليل';
    return 'متوفر';
  }
  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  getProfit(p: Produit): number { return p.prix_vente - p.prix_achat; }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
