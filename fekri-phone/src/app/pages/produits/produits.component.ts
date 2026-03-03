import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { AIService } from '../../components/ai-assistant/ai-assistant';
import { Produit, Categorie } from '../../core/models/models';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-produits',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './produits.component.html',
  styleUrl: './produits.component.css'
})
export class ProduitsComponent implements OnInit {
  produits: Produit[] = [];
  filteredProduits$ = new BehaviorSubject<Produit[]>([]);
  categories$ = new BehaviorSubject<Categorie[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  showModal = false;
  editMode = false;
  searchTerm = '';
  filterCategorie = '';
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  currentPage = 1;
  pageSize = 10;
  totalPages = 1;
  paginatedProduits$ = new BehaviorSubject<Produit[]>([]);

  form = {
    id: '', nom: '', categorie_id: '', prix_achat: 0,
    prix_vente: 0, quantite: 0, code_barre: '', description: ''
  };

  private categories: Categorie[] = [];

  // Scanned Invoice Logic
  showScanModal = false;
  isScanning = false;
  scannedProducts: any[] = [];

  constructor(private supabase: SupabaseService, private aiService: AIService, private cdr: ChangeDetectorRef) {}

  ngOnInit() { this.loadData(); }

  async loadData() {
    try {
      this.loading$.next(true);
      const [produits, categories] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getCategories()
      ]);
      this.produits = produits;
      this.categories = categories;
      this.categories$.next(categories);
      this.applyFilter();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  applyFilter() {
    let result = [...this.produits];
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(p =>
        p.nom.toLowerCase().includes(term) ||
        (p.code_barre && p.code_barre.includes(term))
      );
    }
    if (this.filterCategorie) {
      result = result.filter(p => p.categorie_id === this.filterCategorie);
    }
    this.filteredProduits$.next(result);
    this.currentPage = 1;
    this.paginate(result);
  }

  paginate(items?: Produit[]) {
    const all = items || this.filteredProduits$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedProduits$.next(all.slice(start, start + this.pageSize));
  }

  goToPage(p: number) {
    this.currentPage = p;
    this.paginate();
  }

  getPages(): number[] {
    return Array.from({ length: this.totalPages }, (_, i) => i + 1);
  }

  openAdd() {
    this.editMode = false;
    this.form = { id: '', nom: '', categorie_id: this.categories[0]?.id || '', prix_achat: 0, prix_vente: 0, quantite: 0, code_barre: '', description: '' };
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
    if (!this.form.nom || !this.form.categorie_id) {
      this.showToast('خصك تدخل الإسم والفئة', 'error');
      return;
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
        this.showToast('تعدل المنتج بنجاح ✅', 'success');
      } else {
        await this.supabase.addProduit(data);
        this.showToast('تزاد المنتج بنجاح ✅', 'success');
      }
      this.closeModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل، عاود حاول', 'error');
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
      cancelButtonText: 'لا، خليه'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteProduit(p.id);
      this.showToast('تمسح المنتج ✅', 'success');
      await this.loadData();
    } catch (error) {
      this.showToast('ما قدرش يتمسح، يقدر يكون مستعمل فالمبيعات', 'error');
    }
  }

  getCategoryName(id: string): string {
    return this.categories.find(c => c.id === id)?.nom || '';
  }

  formatMAD(amount: number): string {
    return Number(amount).toLocaleString('ar-MA') + ' د.م';
  }

  showToast(message: string, type: string) {
    this.toastMessage$.next({ message, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
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

  // Product detail
  selectedProduct: Produit | null = null;
  showDetailModal = false;

  viewProduct(p: Produit) {
    this.selectedProduct = p;
    this.showDetailModal = true;
  }

  closeDetailModal() {
    this.showDetailModal = false;
    this.selectedProduct = null;
  }

  getProfit(p: Produit): number {
    return p.prix_vente - p.prix_achat;
  }

  getCategoryIcon(id: string): string {
    const cat = this.categories.find(c => c.id === id);
    return (cat as any)?.icone || '📦';
  }

  // Quick Stock Adjustment
  showStockModal = false;
  stockProduct: Produit | null = null;
  stockNewQty = 0;

  openStockModal(p: Produit) {
    this.stockProduct = p;
    this.stockNewQty = p.quantite;
    this.showStockModal = true;
  }

  closeStockModal() {
    this.showStockModal = false;
    this.stockProduct = null;
  }

  adjustStock(delta: number) {
    this.stockNewQty = Math.max(0, this.stockNewQty + delta);
  }

  async saveStock() {
    if (!this.stockProduct) return;
    try {
      await this.supabase.updateProduit(this.stockProduct.id, { quantite: this.stockNewQty });
      this.showToast('تبدل المخزن ✅', 'success');
      this.closeStockModal();
      await this.loadData();
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  // ========== AI Invoice Scanner ==========
  async onFileSelected(event: any) {
    const file = event.target.files[0];
    if (!file) return;

    // reset input so the exact same file can be selected again if needed
    event.target.value = '';

    this.isScanning = true;
    this.scannedProducts = [];
    this.showScanModal = true;

    try {
      const base64Data = await this.compressImage(file);
      const mimeType = 'image/jpeg'; // After compression it's jpeg

      // Send to Gemini with categories list so AI can auto-detect
      const categoryNames = this.categories.map(c => c.nom);
      const extractedProducts = await this.aiService.parseInvoiceImage(base64Data, mimeType, categoryNames);
      
      this.scannedProducts = extractedProducts.map(p => {
        // Try to match AI's categorie_nom to a real category
        const matchedCat = this.categories.find(c =>
          c.nom.toLowerCase().includes((p.categorie_nom || '').toLowerCase()) ||
          (p.categorie_nom || '').toLowerCase().includes(c.nom.toLowerCase())
        );

        // Check if product already exists in current stock (by name similarity)
        const existingProduct = this.produits.find(ep =>
          ep.nom.toLowerCase().trim() === (p.nom || '').toLowerCase().trim()
        );

        return {
          ...p,
          selected: true,
          categorie_id: matchedCat?.id || '',
          categorie_nom: matchedCat?.nom || p.categorie_nom || '',
          existingProductId: existingProduct?.id || null,
          existingStock: existingProduct?.quantite || 0,
          isExisting: !!existingProduct
        };
      });
      this.cdr.detectChanges();

    } catch (apiError: any) {
      console.error(apiError);
      const errorMsg = apiError.message || 'فشل قراءة الفاتورة! جرب صورة أوضح';
      this.showToast(errorMsg, 'error');
      this.closeScanModal();
    } finally {
      this.isScanning = false;
      this.cdr.detectChanges();
    }
  }

  // Compress large images to speed up AI parsing
  private compressImage(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            // Compress generic JPEG (90% quality)
            const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
            // return only base64 string
            resolve(dataUrl.split(',')[1]);
          } else {
            reject(new Error('Canvas ctx null'));
          }
        };
        img.onerror = () => reject(new Error('Image creation failed'));
        img.src = e.target.result;
      };
      reader.onerror = () => reject(new Error('File reading failed'));
      reader.readAsDataURL(file);
    });
  }

  closeScanModal() {
    this.showScanModal = false;
    this.scannedProducts = [];
    this.isScanning = false;
  }

  // Apply a quick margin % to all scanned products
  applyMargin(percent: number) {
    this.scannedProducts.forEach(p => {
      if (p.prix_achat > 0) {
        p.prix_vente = Math.round(p.prix_achat * (1 + percent / 100));
      }
    });
    this.cdr.detectChanges();
  }

  async saveScannedProducts() {
    const toSave = this.scannedProducts.filter(p => p.selected);
    if (toSave.length === 0) {
      this.showToast('عزل بعدا المنتجات لي بغيتي تحفظ', 'error');
      return;
    }

    try {
      this.isScanning = true;
      let addedCount = 0;
      let updatedCount = 0;

      const promises = toSave.map(async (p) => {
        if (p.isExisting && p.existingProductId) {
          // Product exists: just add the new quantity to existing stock
          const newQty = (p.existingStock || 0) + (p.quantite || 0);
          await this.supabase.updateProduit(p.existingProductId, {
            quantite: newQty,
            prix_achat: p.prix_achat || undefined, // Update purchase price if available
          });
          updatedCount++;
        } else {
          // New product: insert it
          await this.supabase.addProduit({
            nom: p.nom,
            categorie_id: p.categorie_id || this.categories[0]?.id || null,
            quantite: p.quantite || 0,
            prix_achat: p.prix_achat || 0,
            prix_vente: p.prix_vente || 0,
            code_barre: p.code_barre || null,
            description: 'مضاف عبر الفاتورة الآلية'
          });
          addedCount++;
        }
      });

      await Promise.all(promises);

      let msg = '';
      if (addedCount > 0) msg += `تزادو ${addedCount} منتجات جدد ➕`;
      if (updatedCount > 0) msg += ` | تزاد الستوك ل ${updatedCount} منتجات موجودين 📦`;
      this.showToast(msg || 'تم بنجاح ✅', 'success');
      this.closeScanModal();
      await this.loadData();
    } catch (err) {
      console.error(err);
      this.showToast('مشكل أثناء حفظ المنتجات', 'error');
    } finally {
      this.isScanning = false;
    }
  }

}
