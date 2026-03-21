import { Component, OnInit, ChangeDetectorRef, NgZone, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { SupabaseService } from '../../core/services/supabase.service';
import { LayoutService } from '../../core/services/layout.service';
import { AuthService } from '../../core/services/auth.service';
import Swal from 'sweetalert2';
import { Produit, Vente, Categorie, Client } from '../../core/models/models';

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
  clients: Client[] = [];
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
  showLowStock = false;
  currentPage = 1;
  pageSize = 5;
  totalPages = 1;
  paginatedVentes$ = new BehaviorSubject<Vente[]>([]);
  userRole = 'admin';
  selectedDate: string = new Date().toISOString().split('T')[0];
  allVentesData: Vente[] = [];
 
  private cart: CartItem[] = [];
  editingVenteId: string | null = null;
 
  @ViewChild('searchInput') searchInput!: ElementRef;
  private focusSearchNeedsTrigger = false;

  constructor(
    private supabase: SupabaseService,
    private auth: AuthService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private layout: LayoutService
  ) { }

  ngOnInit() { 
    this.auth.userRole$.subscribe((role: string) => {
      this.userRole = role;
      this.cdr.detectChanges();
    });
    this.loadData(); 
  }

  ngAfterViewChecked() {
    if (this.focusSearchNeedsTrigger && this.searchInput) {
      this.searchInput.nativeElement.focus();
      this.focusSearchNeedsTrigger = false;
    }
  }

  async loadData() {
    try {
      this.loading$.next(true);
      const [produits, ventes, categories, clients] = await Promise.all([
        this.supabase.getProduits(),
        this.supabase.getVentes(),
        this.supabase.getCategories(),
        this.supabase.getClients()
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
      this.clients = clients;

      let finalVentes = ventes;
      if (this.userRole !== 'admin') {
        const uid = this.auth.currentUser?.id;
        finalVentes = ventes.filter((v: any) => v.user_id === uid);
      }

      this.allVentesData = finalVentes;
      this.categories$.next(categories);
      this.filteredProduits$.next([...produits]);
      
      this.filterByDate();
    } catch (error) {
      this.showToast('خطأ فالتحميل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  filterByDate() {
    let filtered = this.allVentesData;
    if (this.selectedDate) {
      filtered = filtered.filter(v => (v.date.split(' ')[0] || v.date) === this.selectedDate);
    }
    this.ventes$.next(filtered);
    
    // Total for filtered items
    const total = filtered.reduce((s: number, v: any) => s + Number(v.montant_total), 0);
    this.totalMois$.next(total);
    
    this.currentPage = 1;
    this.paginateVentes();
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
    this.layout.setPosModalState(true);
    this.layout.enterFullscreen();
    this.focusSearchNeedsTrigger = true;
    this.editingVenteId = null;
    this.montantRecu = null;
    this.montantPaye = null;
    this.nomClient = '';
    this.descriptionCredit = '';
    this.cdr.detectChanges();
  }

  editVente(vente: any) {
    this.editingVenteId = vente.id;
    this.cart = vente.vente_items.map((vi: any) => ({
      produit_id: vi.produit_id,
      nom: vi.produits?.nom || 'منتج',
      icone: '📦', // Or fetch from product
      prix_unitaire: vi.prix_unitaire,
      prix_original: vi.prix_unitaire,
      prix_achat_unitaire: vi.prix_achat_unitaire,
      profit: vi.profit,
      quantite: vi.quantite,
      stock_restant: vi.produits?.quantite || 0,
      sous_total: vi.sous_total
    }));
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
    this.searchTerm = '';
    this.activeCategory = '';
    this.filteredProduits$.next([...this.allProduits]);
    
    // Set payment fields if applicable
    this.montantPaye = null;
    this.montantRecu = null;
    this.nomClient = '';
    this.descriptionCredit = '';

    this.showVenteModal = true;
    this.layout.setPosModalState(true);
    this.layout.enterFullscreen();
    this.focusSearchNeedsTrigger = true;
    this.cdr.detectChanges();
  }

  closeVenteModal() {
    this.showVenteModal = false;
    this.layout.setPosModalState(false);
    this.layout.exitFullscreen();
    this.cdr.detectChanges();
  }

  filterByCategory(catId: string) {
    this.activeCategory = catId;
    this.searchTerm = '';
    this.showLowStock = false;
    this.applyProductFilter();
    this.focusSearchNeedsTrigger = true;
  }

  searchProduits() {
    this.activeCategory = '';
    this.showLowStock = false;
    this.applyProductFilter();
  }

  filterLowStock() {
    this.showLowStock = !this.showLowStock;
    this.activeCategory = '';
    this.searchTerm = '';
    this.applyProductFilter();
    this.focusSearchNeedsTrigger = true;
  }

  private async applyProductFilter() {
    let result = [...this.allProduits];
    if (this.showLowStock) {
      result = result.filter(p => p.quantite <= 3).sort((a, b) => a.quantite - b.quantite);
    }
    if (this.activeCategory) {
      result = result.filter(p => p.categorie_id === this.activeCategory);
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      result = result.filter(p =>
        (p.nom && p.nom.toLowerCase().includes(term)) ||
        (p.code_barre && p.code_barre.includes(term))
      );
      // Auto-add barcode match
      if (result.length === 1 && result[0].code_barre === this.searchTerm) {
        await this.addToCart(result[0]);
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

  async addToCart(p: Produit) {
    // If product has no price, ask the employee to enter it
    if (!p.prix_vente || p.prix_vente === 0) {
      const { value: price } = await Swal.fire({
        title: 'دخل ثمن البيع 💰',
        text: `هاد المنتج (${p.nom}) ماعندوش ثمن، شحال غتبيعو؟`,
        input: 'number',
        inputAttributes: {
          min: '1',
          step: '1'
        },
        showCancelButton: true,
        confirmButtonText: 'تأكيد',
        cancelButtonText: 'إلغاء',
        confirmButtonColor: 'var(--primary)',
        heightAuto: false
      });
      
      if (price === undefined || price === null || price === '') return;
      p.prix_vente = Number(price);
    }

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
    this.cdr.detectChanges();
  }

  decrementCartItem(item: CartItem) {
    if (item.quantite > 1) {
      item.quantite--;
      item.sous_total = item.quantite * item.prix_unitaire;
      item.profit = (item.prix_unitaire - item.prix_achat_unitaire) * item.quantite;
      item.stock_restant++;
      this.cart$.next([...this.cart]);
      this.updateCartTotal();
      this.focusSearchNeedsTrigger = true;
      this.cdr.detectChanges();
    } else {
      const index = this.cart.findIndex(c => c.produit_id === item.produit_id);
      if (index > -1) this.removeFromCart(index);
    }
  }

  decrementCartByProductId(productId: string) {
    const item = this.cart.find(c => c.produit_id === productId);
    if (item) this.decrementCartItem(item);
  }

  async incrementCartItem(item: CartItem) {
    const p = this.allProduits.find(pr => pr.id === item.produit_id);
    if (p) await this.addToCart(p);
  }

  async incrementCartByProductId(productId: string) {
    const p = this.allProduits.find(pr => pr.id === productId);
    if (p) await this.addToCart(p);
  }

  getCartQty(productId: string): number {
    const item = this.cart.find(c => c.produit_id === productId);
    return item ? item.quantite : 0;
  }

  removeFromCart(index: number) {
    this.cart.splice(index, 1);
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
    this.focusSearchNeedsTrigger = true;
    this.cdr.detectChanges();
  }

  updateCartItem(item: CartItem) {
    item.sous_total = item.quantite * item.prix_unitaire;
    item.profit = (item.prix_unitaire - item.prix_achat_unitaire) * item.quantite;
    this.cart$.next([...this.cart]);
    this.updateCartTotal();
    this.cdr.detectChanges();
  }

  private updateCartTotal() {
    this.cartTotal$.next(this.cart.reduce((s, i) => s + i.sous_total, 0));
    this.checkUpsell();
  }

  // --- Agent Up-sell (Le Vendeur IA) ---
  upsellSuggestion: { message: string; products: Produit[]; discount: number } | null = null;

  checkUpsell() {
    this.upsellSuggestion = null;

    // We only trigger upsell if cart has items, but not too many to avoid annoying the user
    if (this.cart.length === 0 || this.cart.length > 4) return;

    const hasPhone = this.cart.some(item => 
      item.prix_unitaire >= 800 || 
      (item.nom && item.nom.toLowerCase().includes('iphone')) || 
      (item.nom && item.nom.toLowerCase().includes('samsung')) || 
      (item.nom && item.nom.toLowerCase().includes('redmi'))
    );

    const hasAntiChoc = this.cart.some(item => item.nom && (item.nom.toLowerCase().includes('anti') || item.nom.toLowerCase().includes('incassable')));
    const hasPochette = this.cart.some(item => item.nom && (item.nom.toLowerCase().includes('pochette') || item.nom.toLowerCase().includes('silicone') || item.nom.toLowerCase().includes('etui')));

    // Scenario 1: Phone = Suggest Anti-choc + Pochette
    if (hasPhone && (!hasAntiChoc || !hasPochette)) {
      const antiChocs = this.allProduits.filter(p => p.nom && (p.nom.toLowerCase().includes('anti') || p.nom.toLowerCase().includes('incassable')) && p.quantite > 0);
      const pochettes = this.allProduits.filter(p => p.nom && (p.nom.toLowerCase().includes('pochette') || p.nom.toLowerCase().includes('silicone') || p.nom.toLowerCase().includes('etui')) && p.quantite > 0);

      const toSuggest: Produit[] = [];
      if (!hasAntiChoc && antiChocs.length > 0) toSuggest.push(antiChocs[0]);
      if (!hasPochette && pochettes.length > 0) toSuggest.push(pochettes[0]);

      if (toSuggest.length > 0) {
        const productNames = toSuggest.map(p => p.nom).join(' و ');
        this.upsellSuggestion = {
          message: `💡 <strong>اقتراح حماية (Agent IA):</strong> اقترح على الزبون <b>${productNames}</b> لحماية هاتفه الجديد! بيعهم مع التلفون واعمل ليه تخفيض 20 د.م 🎁`,
          products: toSuggest,
          discount: 20
        };
        return; // Don't check other scenarios
      }
    } 
    
    // Scenario 2: Charger = Suggest Cable
    const hasChargeur = this.cart.some(item => item.nom && (item.nom.toLowerCase().includes('chargeur') || item.nom.toLowerCase().includes('شاحن')));
    if (hasChargeur) {
       const hasCable = this.cart.some(item => item.nom && (item.nom.toLowerCase().includes('cable') || item.nom.toLowerCase().includes('كابل')));
       if (!hasCable) {
          const cables = this.allProduits.filter(p => p.nom && (p.nom.toLowerCase().includes('cable') || p.nom.toLowerCase().includes('كابل')) && p.quantite > 0);
          if (cables.length > 0) {
            this.upsellSuggestion = {
              message: `💡 <strong>اقتراح ذكي (Agent IA):</strong> الزبون خذا شاحن، واش ما يحتاجش كابل معاه؟ زيدلو <b>${cables[0].nom}</b> بتخفيض 10 د.م ⚡`,
              products: [cables[0]],
              discount: 10
            };
          }
       }
    }
  }

  async applyUpsell() {
    if (!this.upsellSuggestion) return;
    for (const p of this.upsellSuggestion.products) {
      await this.addToCart(p);
      // Give the discount to the newly added item
      setTimeout(() => {
        const item = this.cart.find(c => c.produit_id === p.id);
        if (item) {
          // split discount across suggested items
          const discountPerItem = this.upsellSuggestion!.discount / this.upsellSuggestion!.products.length;
          // Ensure we don't sell below buy price if possible
          item.prix_unitaire = Math.max(item.prix_achat_unitaire, item.prix_unitaire - discountPerItem);
          this.updateCartItem(item);
        }
      }, 50);
    }
    this.upsellSuggestion = null;
    this.showToast('تمت إضافة العرض بنجاح! 🚀', 'success');
    this.cdr.detectChanges();
  }

  // --- Smart Calculator (Caisse) & Credit ---
  montantRecu: number | null = null;
  montantPaye: number | null = null;
  nomClient: string = '';
  descriptionCredit: string = '';

  get defaultCreditDescription(): string {
    if (this.cart.length === 0) return '';
    const items = this.cart.map(i => `${i.quantite}x ${i.nom}`).join(' و ');
    return `باقي من ثمن ${items}`;
  }

  get totalCart(): number {
    return this.cart.reduce((s, i) => s + i.sous_total, 0);
  }

  get resteAPayer(): number {
    const total = this.totalCart;
    if (this.montantPaye === null || this.montantPaye >= total) return 0;
    return total - this.montantPaye;
  }

  get monnaie(): number {
    const total = this.totalCart;
    const aPayer = this.montantPaye !== null ? this.montantPaye : total;
    if (!this.montantRecu || this.montantRecu < aPayer) return 0;
    return this.montantRecu - aPayer;
  }

  setMontantRecu(amount: number) {
    this.montantRecu = amount;
  }

  addMontantRecu(amount: number) {
    this.montantRecu = (this.montantRecu || 0) + amount;
  }

  async confirmVente() {
    if (this.cart.length === 0) { this.showToast('السلة فارغة!', 'error'); return; }
    
    const total = this.totalCart;
    const reste = this.resteAPayer;

    if (reste > 0 && !this.nomClient.trim()) {
      this.showToast('المرجو إدخال إسم الزبون للكريدي!', 'error');
      return;
    }

    try {
      const profitTotal = this.cart.reduce((s, i) => s + i.profit, 0);
      const uid = this.auth.currentUser?.id;

      if (this.editingVenteId) {
        await this.supabase.updateVente(this.editingVenteId, total, profitTotal, this.cart, uid);
        this.editingVenteId = null;
      } else {
        await this.supabase.addVente(total, profitTotal, this.cart, uid);
      }
      
      if (reste > 0) {
        const finalDesc = this.descriptionCredit.trim() || this.defaultCreditDescription;
        
        let client = this.clients.find(c => c.nom.toLowerCase() === this.nomClient.trim().toLowerCase());
        let clientId = client ? client.id : null;
        
        if (!clientId) {
           const newClient = await this.supabase.addClient({ nom: this.nomClient.trim() });
           clientId = newClient.id;
        }

        await this.supabase.addCredit({
          client_id: clientId,
          nom_client: this.nomClient.trim(),
          description: finalDesc,
          montant: reste,
          montant_paye: 0,
          est_paye: false,
          date: new Date().toISOString().split('T')[0]
        }, uid);
      }

      this.printTicket(this.cart, total, this.montantPaye !== null ? this.montantPaye : total, reste);

      this.ngZone.run(() => {
        this.showToast('تسجلت البيعة بنجاح ✅', 'success');
        this.cart = [];
        this.cart$.next([]);
        this.updateCartTotal();
        this.montantRecu = null; 
        this.montantPaye = null;
        this.nomClient = '';
        this.descriptionCredit = '';
        this.closeVenteModal();
        this.loadData();
      });
    } catch (error) {
      this.showToast('وقع مشكل', 'error');
    }
  }


  printTicket(cartItems: CartItem[], total: number, paye: number, reste: number) {
    let html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <title>توصيل البيع</title>
        <style>
          @page { margin: 0; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            margin: 0; padding: 10px; width: 80mm; font-size: 11px; color: #000;
            line-height: 1.4;
          }
          .header { text-align: center; margin-bottom: 12px; border-bottom: 2px dashed #000; padding-bottom: 8px; }
          .logo { width: 40px; height: 40px; margin-bottom: 4px; }
          .title { font-size: 18px; font-weight: 900; letter-spacing: 1px; margin-bottom: 2px; }
          .subtitle { font-size: 10px; color: #555; margin-bottom: 4px; }
          .date { font-size: 10px; color: #000; font-weight: bold; background: #eee; padding: 2px; display: inline-block; border-radius: 4px;}
          .table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .table th { border-bottom: 1px solid #000; text-align: right; padding: 6px 0; font-size: 11px; text-transform: uppercase; color: #555;}
          .table td { padding: 6px 0; border-bottom: 1px dotted #aaa; font-size: 12px; font-weight: 500;}
          .col-qty { width: 15%; text-align: center; font-weight: bold;}
          .col-name { width: 55%; padding-left: 5px;}
          .col-price { width: 30%; text-align: left; font-weight: bold;}
          .total-section { border-top: 2px dashed #000; padding-top: 8px; margin-top: 5px; display: flex; justify-content: space-between; align-items: center;}
          .total-label { font-size: 14px; font-weight: bold; }
          .total-amount { font-size: 18px; font-weight: 900; }
          .footer { text-align: center; font-size: 10px; margin-top: 20px; font-weight: bold; }
          .barcode-container { text-align: center; margin-top: 15px; }
          .barcode-line { height: 25px; width: 80%; background: repeating-linear-gradient(90deg, #000, #000 2px, transparent 2px, transparent 4px); margin: 0 auto; margin-bottom: 3px;}
        </style>
      </head>
      <body>
        <div class="header">
          <img class="logo" src="${window.location.origin}/assets/logo.jpg" alt="Fekri Phone Logo">
          <div class="title">FEKRI PHONE</div>
          <div class="subtitle">بيع وتسويق الهواتف الذكية ولوازمها</div>
          <div class="date">${new Intl.DateTimeFormat('ar-MA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date())}</div>
        </div>
        <table class="table">
          <thead>
            <tr>
              <th class="col-name">المنتج</th>
              <th class="col-qty">الكمية</th>
              <th class="col-price">الثمن</th>
            </tr>
          </thead>
          <tbody>
    `;

    cartItems.forEach(item => {
      html += `
        <tr>
          <td class="col-name">${item.nom}</td>
          <td class="col-qty">${item.quantite}</td>
          <td class="col-price">${item.sous_total} د.م</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <div class="total-section">
          <span class="total-label">المجموع الإجمالي:</span>
          <span class="total-amount">${total} د.م</span>
        </div>
        ${reste > 0 ? `
        <div style="display:flex; justify-content:space-between; margin-top:5px; font-weight:bold; font-size:12px;">
          <span>المبلغ المؤدى:</span>
          <span>${paye} د.م</span>
        </div>
        <div style="display:flex; justify-content:space-between; margin-top:2px; font-weight:bold; font-size:12px; color:#d32f2f;">
          <span>الباقي (كريدي):</span>
          <span>${reste} د.م</span>
        </div>
        ` : ''}
        
        <div class="barcode-container">
          <div class="barcode-line"></div>
          <div>شكراً على زيارتكم!</div>
        </div>
        <div class="footer">
          مرحباً بكم دائماً
        </div>
      </body>
      </html>
    `;

    // Create an invisible iframe for printing to avoid opening full blank tabs
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '-1000px';
    iframe.style.bottom = '-1000px';
    iframe.style.width = '80mm';
    iframe.style.height = '100mm';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
          setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        }, 300);
      };
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
      const uid = this.auth.currentUser?.id;
      await this.supabase.deleteVente(v.id, uid);
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
