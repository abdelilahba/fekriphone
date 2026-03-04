import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
  }

  get client(): SupabaseClient {
    return this.supabase;
  }

  // ==================== Categories ====================
  async getCategories() {
    const { data, error } = await this.supabase
      .from('categories')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async addCategorie(nom: string, icone: string = '📦') {
    const { data, error } = await this.supabase
      .from('categories')
      .insert({ nom, icone })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateCategorie(id: string, nom: string, icone: string = '📦') {
    const { data, error } = await this.supabase
      .from('categories')
      .update({ nom, icone })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteCategorie(id: string) {
    const { error } = await this.supabase
      .from('categories')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Produits ====================
  async getProduits() {
    const { data, error } = await this.supabase
      .from('produits')
      .select('*, categories(nom)')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async getProduitByCodeBarre(codeBarre: string) {
    const { data, error } = await this.supabase
      .from('produits')
      .select('*, categories(nom)')
      .eq('code_barre', codeBarre)
      .single();
    if (error) throw error;
    return data;
  }

  async addProduit(produit: any) {
    const { data, error } = await this.supabase
      .from('produits')
      .insert(produit)
      .select('*, categories(nom)')
      .single();
    if (error) throw error;
    return data;
  }

  async updateProduit(id: string, produit: any) {
    const { data, error } = await this.supabase
      .from('produits')
      .update({ ...produit, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, categories(nom)')
      .single();
    if (error) throw error;
    return data;
  }

  async deleteProduit(id: string) {
    const { error } = await this.supabase
      .from('produits')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Ventes ====================
  async getVentes() {
    const { data, error } = await this.supabase
      .from('ventes')
      .select('*, vente_items(*, produits(nom))')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addVente(montantTotal: number, profitTotal: number, items: any[]) {
    const { data: vente, error: venteError } = await this.supabase
      .from('ventes')
      .insert({ montant_total: montantTotal, profit_total: profitTotal })
      .select()
      .single();
    if (venteError) throw venteError;

    const venteItems = items.map(item => ({
      vente_id: vente.id,
      produit_id: item.produit_id,
      quantite: item.quantite,
      prix_unitaire: item.prix_unitaire,
      prix_achat_unitaire: item.prix_achat_unitaire || 0,
      profit: item.profit || 0,
      sous_total: item.sous_total
    }));

    const { error: itemsError } = await this.supabase
      .from('vente_items')
      .insert(venteItems);
    if (itemsError) throw itemsError;

    // Update stock
    for (const item of items) {
      const { error } = await this.supabase.rpc('decrement_stock', {
        p_id: item.produit_id,
        p_qty: item.quantite
      });
      // If RPC doesn't exist, do it manually
      if (error) {
        await this.supabase
          .from('produits')
          .update({ quantite: item.stock_restant })
          .eq('id', item.produit_id);
      }
    }

    return vente;
  }

  async deleteVente(id: string) {
    const { error } = await this.supabase
      .from('ventes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Revenus Réparation ====================
  async getRevenus() {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addRevenu(revenu: any) {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .insert(revenu)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateRevenu(id: string, revenu: any) {
    const { data, error } = await this.supabase
      .from('revenus_reparation')
      .update(revenu)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteRevenu(id: string) {
    const { error } = await this.supabase
      .from('revenus_reparation')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Dépenses ====================
  async getDepenses() {
    const { data, error } = await this.supabase
      .from('depenses')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addDepense(depense: any) {
    const { data, error } = await this.supabase
      .from('depenses')
      .insert(depense)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateDepense(id: string, depense: any) {
    const { data, error } = await this.supabase
      .from('depenses')
      .update(depense)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteDepense(id: string) {
    const { error } = await this.supabase
      .from('depenses')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Credits ====================
  async getCredits() {
    const { data, error } = await this.supabase
      .from('credits')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addCredit(credit: any) {
    const { data, error } = await this.supabase
      .from('credits')
      .insert(credit)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updateCredit(id: string, credit: any) {
    const { data, error } = await this.supabase
      .from('credits')
      .update({ ...credit, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteCredit(id: string) {
    const { error } = await this.supabase
      .from('credits')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Pertes (Produits défectueux) ====================
  async getPertes() {
    const { data, error } = await this.supabase
      .from('pertes')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addPerte(perte: any) {
    const { data, error } = await this.supabase
      .from('pertes')
      .insert(perte)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async updatePerte(id: string, perte: any) {
    const { data, error } = await this.supabase
      .from('pertes')
      .update(perte)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deletePerte(id: string) {
    const { error } = await this.supabase
      .from('pertes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  // ==================== Dashboard Stats ====================
  async getDashboardStats() {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

    const [produits, revenus, depenses, credits, ventes, pertes] = await Promise.all([
      this.supabase.from('produits').select('id', { count: 'exact', head: true }),
      this.supabase.from('revenus_reparation').select('montant').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('depenses').select('montant').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('credits').select('montant, montant_paye').eq('est_paye', false),
      this.supabase.from('ventes').select('montant_total, profit_total').gte('date', firstDay).lte('date', lastDay),
      this.supabase.from('pertes').select('montant_perte').gte('date', firstDay).lte('date', lastDay)
    ]);

    const totalRevenus = (revenus.data || []).reduce((s: number, r: any) => s + Number(r.montant), 0);
    const totalDepenses = (depenses.data || []).reduce((s: number, d: any) => s + Number(d.montant), 0);
    const totalCredits = (credits.data || []).reduce((s: number, c: any) => s + (Number(c.montant) - Number(c.montant_paye)), 0);
    const totalVentes = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.montant_total), 0);
    const totalProfitVentes = (ventes.data || []).reduce((s: number, v: any) => s + Number(v.profit_total || 0), 0);
    const totalPertes = (pertes.data || []).reduce((s: number, p: any) => s + Number(p.montant_perte), 0);

    return {
      totalProduits: produits.count || 0,
      totalRevenusReparation: totalRevenus,
      totalDepenses: totalDepenses,
      totalCreditsEnCours: totalCredits,
      totalVentes: totalVentes,
      totalPertes: totalPertes,
      benefice: totalProfitVentes + totalRevenus - totalDepenses - totalPertes
    };
  }

  // ==================== Commandes Fournisseur ====================
  async getCommandes() {
    const { data, error } = await this.supabase
      .from('commandes')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async addCommande(commande: any) {
    const { data, error } = await this.supabase
      .from('commandes')
      .insert(commande)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async deleteCommande(id: string) {
    const { error } = await this.supabase
      .from('commandes')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }

  async updateCommande(id: string, data: any) {
    const { error } = await this.supabase
      .from('commandes')
      .update(data)
      .eq('id', id);
    if (error) throw error;
  }

  async receiveCommande(commandeId: string, articles: { produit_id: string; quantite_recue: number; prix_achat_reel: number }[]) {
    // Update stock for each article
    for (const art of articles) {
      if (art.quantite_recue <= 0) continue;
      // Get current product
      const { data: produit, error: fetchErr } = await this.supabase
        .from('produits')
        .select('quantite, prix_achat')
        .eq('id', art.produit_id)
        .single();
      if (fetchErr) throw fetchErr;

      const newQte = (produit.quantite || 0) + art.quantite_recue;
      const updateData: any = { quantite: newQte, updated_at: new Date().toISOString() };
      // Update prix_achat if provided
      if (art.prix_achat_reel > 0) {
        updateData.prix_achat = art.prix_achat_reel;
      }
      const { error: updErr } = await this.supabase
        .from('produits')
        .update(updateData)
        .eq('id', art.produit_id);
      if (updErr) throw updErr;
    }

    // Mark commande as received
    await this.updateCommande(commandeId, {
      statut: 'recue',
      date_reception: new Date().toISOString()
    });
  }
}
