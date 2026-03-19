export interface Categorie {
  id: string;
  nom: string;
  icone: string;
  created_at: string;
}

export interface Produit {
  id: string;
  nom: string;
  categorie_id: string;
  prix_achat: number;
  prix_vente: number;
  quantite: number;
  code_barre: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  categories?: Categorie;
}

export interface Vente {
  id: string;
  montant_total: number;
  profit_total: number;
  date: string;
  user_id?: string;
  created_at: string;
  // Joined
  vente_items?: VenteItem[];
  profiles?: { name: string };
}

export interface VenteItem {
  id: string;
  vente_id: string;
  produit_id: string;
  quantite: number;
  prix_unitaire: number;
  prix_achat_unitaire: number;
  profit: number;
  sous_total: number;
  created_at: string;
  // Joined
  produits?: Produit;
}

export interface RevenuReparation {
  id: string;
  description: string;
  montant: number;
  date: string;
  user_id?: string;
  nom_client?: string;
  client_id?: string;
  created_at: string;
  profiles?: { name: string };
}

export interface Depense {
  id: string;
  description: string;
  montant: number;
  categorie: string | null;
  date: string;
  created_at: string;
}

export interface Avance {
  id: string;
  description: string;
  montant: number;
  categorie?: string | null;
  date: string;
  created_at: string;
}

export interface Credit {
  id: string;
  client_id: string | null;
  nom_client: string;
  telephone_client: string | null;
  description: string;
  montant: number;
  montant_paye: number;
  est_paye: boolean;
  date: string;
  created_at: string;
  updated_at: string;
  // Joined
  clients?: Client;
  credit_paiements?: CreditPaiement[];
}

export interface Client {
  id: string;
  nom: string;
  telephone: string | null;
  adresse: string | null;
  created_at: string;
}

export interface CreditPaiement {
  id: string;
  credit_id: string;
  montant: number;
  date: string;
  created_at: string;
}

export interface Perte {
  id: string;
  produit_nom: string;
  description: string | null;
  montant_perte: number;
  quantite: number;
  raison: string;
  date: string;
  created_at: string;
}
