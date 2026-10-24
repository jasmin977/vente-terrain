import type { Article } from "./article";

export type TypeVente = "COMPTANT" | "CREDIT";
/** TRAITE : seulement pour les règlements fournisseurs (les ventes gardent TPE). */
export type ModePaiement = "ESPECES" | "CHEQUE" | "VIREMENT" | "TPE" | "TRAITE";
export type StatutFacture = "VALIDEE" | "ANNULEE";

/** Factures à crédit : déjà réglé / reste (paiements + avances imputées). */
export interface Reglement {
  paye: number;
  reste: number;
  /** Montant réglé selon le mode de chaque paiement / avance imputé. */
  parMode?: Partial<Record<ModePaiement, number>>;
}

export interface LigneFacture {
  id: string;
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  montantHT: number;
  montantTTC: number;
  article: Article;
  /** Promotion : pièces offertes (en plus) et remise HT ; numéro de la promotion. */
  quantiteOfferte?: number | string;
  remise?: number | string;
  promotionId?: string | null;
  promotion?: { numero: string; type: string; mode?: string | null } | null;
}

export interface Facture {
  id: string;
  numero: string;
  clientId: string;
  vendeurId: string;
  date: string;
  typeVente: TypeVente;
  modePaiement?: ModePaiement | null;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  statut: StatutFacture;
  /** Présent pour les factures à crédit validées. */
  reglement?: Reglement | null;
  latitude?: number | null;
  longitude?: number | null;
  lignes: LigneFacture[];
  client?: {
    id: string;
    nomCommerce: string;
    code: string;
    ref?: number;
    adresse?: string | null;
    ville?: string | null;
    telephone?: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
  /** Détail et réponse de création (absent des listes). */
  vendeur?: { id: string; nom: string; code: string };
  /** Créée sur le téléphone, pas encore envoyée au serveur. */
  enAttente?: boolean;
  /** Bon transformé en facture : il n'est plus modifiable. */
  factureVenteId?: string | null;
  factureVente?: { numero: string } | null;
  /** Refus du serveur au dernier envoi. */
  erreurSync?: string;
}

export interface LigneFactureInput {
  articleId: string;
  /** Pièces payées (0 pour un article seulement offert). */
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  quantiteOfferte?: number;
  remise?: number;
  promotionId?: string | null;
}

export interface FactureInput {
  /** Admin seulement : vendeur dont le camion livre le bon. */
  vendeurId?: string;
  clientId: string;
  typeVente: TypeVente;
  modePaiement?: ModePaiement;
  latitude?: number;
  longitude?: number;
  lignes: LigneFactureInput[];
}
