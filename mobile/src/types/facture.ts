import type { Article } from "./article";

export type TypeVente = "COMPTANT" | "CREDIT";
export type ModePaiement = "ESPECES" | "CHEQUE" | "VIREMENT" | "TPE";
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
  client?: { id: string; nomCommerce: string; code: string; latitude?: number | null; longitude?: number | null };
  /** Détail et réponse de création (absent des listes). */
  vendeur?: { id: string; nom: string; code: string };
  /** Créée sur le téléphone, pas encore envoyée au serveur. */
  enAttente?: boolean;
  /** Refus du serveur au dernier envoi. */
  erreurSync?: string;
}

export interface LigneFactureInput {
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

export interface FactureInput {
  clientId: string;
  typeVente: TypeVente;
  modePaiement?: ModePaiement;
  latitude?: number;
  longitude?: number;
  lignes: LigneFactureInput[];
}
