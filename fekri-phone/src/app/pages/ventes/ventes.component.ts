import { Component, OnInit, ChangeDetectorRef, NgZone, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { LayoutService } from '../../core/services/layout.service';
import Swal from 'sweetalert2';
import { Produit, Vente, Categorie } from '../../core/models/models';

interface CartItem {
  produit_id: string;
  nom: string;
  icone: string;
  prix_unitaire: number;
  prix_original: number;
  prix_achat_unitaire: number;
  profit: number;
  quantite: number;
  stock_restant: number;
  sous_total: number;
}

@Component({
  selector: 'app-ventes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ventes.component.html',
  styleUrl: './ventes.component.css'
})
export class VentesComponent implements OnInit, AfterViewChecked {
  private allProduits: Produit[] = [];
  private categories: Categorie[] = [];
  ventes$ = new BehaviorSubject<Vente[]>([]);
  filteredProduits$ = new BehaviorSubject<Produit[]>([]);
  categories$ = new BehaviorSubject<Categorie[]>([]);
  cart$ = new BehaviorSubject<CartItem[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  totalMois$ = new BehaviorSubject<number>(0);
  cartTotal$ = new BehaviorSubject<number>(0);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);
  showVenteModal = false;
  searchTerm = '';
  activeCategory = '';
  currentPage = 1;
  pageSize = 5;
  totalPages = 1;
  paginatedVentes$ = new BehaviorSubject<Vente[]>([]);

  private cart: CartItem[] = [];

  @ViewChild('searchInput') searchInput!: ElementRef;
  private focusSearchNeedsTrigger = false;

  constructor(
    private supabase: SupabaseService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private layout: LayoutService
  ) { }

  ngOnInit() { this.loadData(); }

  ngAfterViewChecked() {
    if (this.focusSearchNeedsTrigger && this.searchInput) {
      this.searchInput.nativeElement.focus();
      this.focusSearchNeedsTrigger = false;
    }
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const [produits, ventes, categories] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getVentes(),
        this.supabase.getCategories()
      ]);
      // Calculate sales per product for sorting "Best Selling First"
      const salesCount: { [key: string]: number } = {};
      ventes.forEach((vente: any) => {
        if (vente.vente_items) {
          vente.vente_items.forEach((item: any) => {
            salesCount[item.produit_id] = (salesCount[item.produit_id] || 0) + item.quantite;
          });
        }
      });

      produits.sort((a, b) => {
        const salesA = salesCount[a.id] || 0;
        const salesB = salesCount[b.id] || 0;
        return salesB - salesA; // Descending
      });

      this.allProduits = produits;
      this.categories = categories;
      this.ventes$.next(ventes);
      this.categories$.next(categories);
      this.filteredProduits$.next([...produits]);
      const now = new Date();
      const total = ventes
        .filter((v: any) => { const d = new Date(v.date); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); })
        .reduce((s: number, v: any) => s + Number(v.montant_total), 0);
      this.totalMois$.next(total);
      this.currentPage = 1;
      this.paginateVentes();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  paginateVentes() {
    const all = this.ventes$.value;
    this.totalPages = Math.max(1, Math.ceil(all.length / this.pageSize));
    const start = (this.currentPage - 1) * this.pageSize;
    this.paginatedVentes$.next(all.slice(start, start + this.pageSize));
  }
  goToPage(p: number) { this.currentPage = p; this.paginateVentes(); }
  getPages(): number[] { return Array.from({ length: this.totalPages }, (_, i) => i + 1); }

  openVente() {
    this.cart = [];
    this.cart$.next([]);
    this.cartTotal$.next(0);
    this.searchTerm = '';
    this.activeCategory = '';
    this.filteredProduits$.next([...this.allProduits]);
    this.showVenteModal = true;
    this.layout.enterFullscreen();
    this.focusSearchNeedsTrigger = true;
    this.cdr.detectChanges();
  }

  closeVenteModal() {
    this.showVenteModal = false;
    this.layout.exitFullscreen();
    this.cdr.detectChanges();
  }

  filterByCategory(catId: string) {
    this.activeCategory = catId;
    this.searchTerm = '';
    this.applyProductFilter();
    this.focusSearchNeedsTrigger = true;
  }

  searchProduits() {
    this.activeCategory = '';
    this.applyProductFilter();
  }

  private applyProductFilter() {
    let result = [...this.allProduits];
    if (this.activeCategory) {
      result = result.filter(p => p.categorie_id === this.activeCategory);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(p =>
        p.nom.toLowerCase().includes(term) ||
        (p.code_barre && p.code_barre.includes(term))
      );
      // Auto-add barcode match
      if (result.length === 1 && result[0].code_barre === this.searchTerm) {
        this.addToCart(result[0]);
        this.searchTerm = '';
        this.applyProductFilter();
        this.focusSearchNeedsTrigger = true;
        return;
      }
    }
    this.filteredProduits$.next(result);
  }

  getCategoryIcon(p: Produit): string {
    const cat = this.categories.find(c => c.id === p.categorie_id);
    return cat?.icone || '📦';
  }

  addToCart(p: Produit) {
    const existing = this.cart.find(c => c.produit_id === p.id);
    if (existing) {
      if (existing.quantite < p.quantite) {
        existing.quantite++;
        existing.sous_total = existing.quantite * existing.prix_unitaire;
        existing.profit = (existing.prix_unitaire - existing.prix_achat_unitaire) * existing.quantite;
        existing.stock_restant = p.quantite - existing.quantite;
      } else {
        this.showToast('ما بقاش فالمخزن!', 'error');
        return;
      }
    } else {
      if (p.quantite <= 0) { this.showToast('هاد المنتج سالي!', 'error'); return; }
      this.cart.push({
        produit_id: p.id, nom: p.nom, icone: this.getCategoryIcon(p),
        prix_unitaire: p.prix_vente, prix_original: p.prix_vente,
        prix_achat_unitaire: p.prix_achat || 0,
        profit: p.prix_vente - (p.prix_achat || 0),
        quantite: 1,
        stock_restant: p.quantite - 1, sous_total: p.prix_vente
      });
    }
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
    this.focusSearchNeedsTrigger = true;
  }

  decrementCartItem(item: CartItem) {
    if (item.quantite > 1) {
      item.quantite--;
      item.sous_total = item.quantite * item.prix_unitaire;
      item.profit = (item.prix_unitaire - item.prix_achat_unitaire) * item.quantite;
      item.stock_restant++;
      this.cart$.next([...this.cart]);
      this.updateCartTotal();
    } else {
      const index = this.cart.findIndex(c => c.produit_id === item.produit_id);
      if (index > -1) this.removeFromCart(index);
    }
  }

  decrementCartByProductId(productId: string) {
    const item = this.cart.find(c => c.produit_id === productId);
    if (item) this.decrementCartItem(item);
  }

  incrementCartItem(item: CartItem) {
    const p = this.allProduits.find(pr => pr.id === item.produit_id);
    if (p) this.addToCart(p);
  }

  incrementCartByProductId(productId: string) {
    const p = this.allProduits.find(pr => pr.id === productId);
    if (p) this.addToCart(p);
  }

  getCartQty(productId: string): number {
    const item = this.cart.find(c => c.produit_id === productId);
    return item ? item.quantite : 0;
  }

  removeFromCart(index: number) {
    this.cart.splice(index, 1);
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
  }

  updateCartItem(item: CartItem) {
    item.sous_total = item.quantite * item.prix_unitaire;
    item.profit = (item.prix_unitaire - item.prix_achat_unitaire) * item.quantite;
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
  }

  private updateCartTotal() {
    this.cartTotal$.next(this.cart.reduce((s, i) => s + i.sous_total, 0));
  }

  async confirmVente() {
    if (this.cart.length === 0) { this.showToast('السلة فارغة!', 'error'); return; }
    try {
      const total = this.cart.reduce((s, i) => s + i.sous_total, 0);
      const profitTotal = this.cart.reduce((s, i) => s + i.profit, 0);
      await this.supabase.addVente(total, profitTotal, this.cart);
      this.ngZone.run(() => {
        this.showToast('تسجلت البيعة بنجاح ✅', 'success');
        this.closeVenteModal();
        this.loadData();
      });
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }

  async deleteVente(v: Vente) {
    const result = await Swal.fire({
      title: 'واش بصح؟',
      text: 'بغيتي تمسح هاد البيعة?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#6b7280',
      confirmButtonText: '🗑️ أيه، مسح',
      cancelButtonText: 'لا، خليها'
    });
    if (!result.isConfirmed) return;
    try {
      await this.supabase.deleteVente(v.id);
      this.showToast('تمسحت ✅', 'success');
      await this.loadData();
    } catch (error) { this.showToast('وقع مشكل', 'error'); }
  }

  formatMAD(a: number): string { return Number(a).toLocaleString('ar-MA') + ' د.م'; }
  currentDate(): string {
    return new Intl.DateTimeFormat('ar-MA', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
  }
  showToast(msg: string, type: string) {
    this.toastMessage$.next({ message: msg, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }
}
