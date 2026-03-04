import { Component, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
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
  providers: [DatePipe],
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
  produitsLowStock: any[] = [];
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

  async openAutoGenerate() {
    try {
      this.loading$.next(true);
      // Get all products to check low stock (e.g., quantite <= 2)
      const produits = await this.supabase.getProduits();
      
      this.produitsLowStock = produits.filter(p => p.quantite <= 3);
      
      this.newOrder = {
        articles: this.produitsLowStock.map(p => ({
          produit_id: p.id,
          nom: p.nom,
          quantite_demandee: 5, // Default propose to buy 5
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
      this.showToast('تم تسجيل الطلبية بنجاح', 'success');
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

  printOrder() {
    window.print();
  }
}
