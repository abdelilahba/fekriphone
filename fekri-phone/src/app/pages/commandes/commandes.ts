import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { BehaviorSubject } from 'rxjs';

interface CommandeArticle {
  produit_id: string;
  nom: string;
  quantite_demandee: number;
  prix_achat_estime: number;
}

interface Commande {
  id?: string;
  created_at?: string;
  articles: CommandeArticle[];
  total_estime: number;
  statut: string;
}

@Component({
  selector: 'app-commandes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './commandes.html',
  styleUrl: './commandes.css',
})
export class Commandes implements OnInit {
  commandes$ = new BehaviorSubject<Commande[]>([]);
  loading$ = new BehaviorSubject<boolean>(true);
  toastMessage$ = new BehaviorSubject<{ message: string; type: string } | null>(null);

  showModal = false;
  viewModal = false;
  selectedCommande: Commande | null = null;

  // Create mode
  orderType: 'auto' | 'manual' = 'auto';
  allProduits: any[] = [];
  searchProduit = '';
  filteredSearchProduits: any[] = [];

  newOrder: Commande = {
    articles: [],
    total_estime: 0,
    statut: 'brouillon'
  };

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.loadCommandes();
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toastMessage$.next({ message, type });
    setTimeout(() => this.toastMessage$.next(null), 3000);
  }

  async loadCommandes() {
    try {
      this.loading$.next(true);
      const data = await this.supabase.getCommandes();
      this.commandes$.next(data || []);
    } catch (error) {
      console.error(error);
      this.showToast('وقع مشكل فجلب الطلبيات', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  // ---- Auto generate (low stock) ----
  async openAutoGenerate() {
    try {
      this.loading$.next(true);
      await this.fetchAllProduits();
      const lowStock = this.allProduits.filter(p => p.quantite <= 3);

      this.orderType = 'auto';
      this.newOrder = {
        articles: lowStock.map(p => ({
          produit_id: p.id,
          nom: p.nom,
          quantite_demandee: 5,
          prix_achat_estime: p.prix_achat || 0
        })),
        total_estime: 0,
        statut: 'brouillon'
      };

      this.calculateTotal();
      this.showModal = true;
    } catch (err) {
      console.error(err);
      this.showToast('مشكل فإيجاد السلعة الناقصة', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  // ---- Manual order ----
  async openManualGenerate() {
    try {
      this.loading$.next(true);
      await this.fetchAllProduits();
      this.orderType = 'manual';
      this.newOrder = { articles: [], total_estime: 0, statut: 'brouillon' };
      this.showModal = true;
    } catch (err) {
      console.error(err);
      this.showToast('وقع مشكل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  async fetchAllProduits() {
    if (this.allProduits.length === 0) {
      this.allProduits = await this.supabase.getProduits() || [];
    }
  }

  filterProduits() {
    if (!this.searchProduit.trim()) {
      this.filteredSearchProduits = [];
      return;
    }
    const term = this.searchProduit.toLowerCase();
    this.filteredSearchProduits = this.allProduits
      .filter(p => p.nom && p.nom.toLowerCase().includes(term))
      .slice(0, 8);
  }

  addProduitToOrder(p: any) {
    const existing = this.newOrder.articles.find(a => a.produit_id === p.id);
    if (existing) {
      existing.quantite_demandee++;
    } else {
      this.newOrder.articles.push({
        produit_id: p.id,
        nom: p.nom,
        quantite_demandee: 1,
        prix_achat_estime: p.prix_achat || 0
      });
    }
    this.searchProduit = '';
    this.filteredSearchProduits = [];
    this.calculateTotal();
  }

  calculateTotal() {
    this.newOrder.total_estime = this.newOrder.articles.reduce(
      (sum, art) => sum + (art.quantite_demandee * art.prix_achat_estime), 0
    );
  }

  removeArticle(index: number) {
    this.newOrder.articles.splice(index, 1);
    this.calculateTotal();
  }

  closeModal() {
    this.showModal = false;
  }

  async saveOrder() {
    if (this.newOrder.articles.length === 0) {
      this.showToast('زيد بعدا المنتجات للائحة', 'error');
      return;
    }
    try {
      this.loading$.next(true);
      await this.supabase.addCommande({
        articles: this.newOrder.articles,
        total_estime: this.newOrder.total_estime,
        statut: 'validee'
      });
      this.showToast('تم تسجيل الطلبية بنجاح ✅', 'success');
      this.closeModal();
      this.loadCommandes();
    } catch (err) {
      console.error(err);
      this.showToast('مشكل فالتسجيل', 'error');
    } finally {
      this.loading$.next(false);
    }
  }

  viewOrder(commande: Commande) {
    this.selectedCommande = commande;
    this.viewModal = true;
  }

  closeViewModal() {
    this.viewModal = false;
    this.selectedCommande = null;
  }

  async deleteOrder(id: string) {
    if (!confirm('واش بصح بغيتي تمسح هاد الطلبية?')) return;
    try {
      await this.supabase.deleteCommande(id);
      this.showToast('تم المسح ✅', 'success');
      this.loadCommandes();
    } catch (err) {
      console.error(err);
      this.showToast('مشكل فالمسح', 'error');
    }
  }

  printOrder() {
    window.print();
  }
}
