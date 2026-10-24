import type { Article } from "./article";

/** RETOUR : camion → dépôt ; RETOUR_CLIENT : produit repris chez un client (revient dans le camion). */
export type SensMouvement = "CHARGEMENT" | "RETOUR" | "VENTE" | "AJUSTEMENT" | "RETOUR_CLIENT";

/** Effet d'un mouvement sur le stock camion (AJUSTEMENT est déjà signé). */
export function effetCamion(m: Pick<MouvementStock, "sens" | "quantite">): number {
  const q = Number(m.quantite);
  return m.sens === "RETOUR" || m.sens === "VENTE" ? -q : q;
}

/** Saisie d'une quantité : en colis ("COLIS", × colisage) ou en pièces ("UNITE"). */
export type UniteSaisie = "COLIS" | "UNITE";

export interface StockCamionItem {
  /** Date d'expiration la plus proche du même article au dépôt (les lots ne sont pas suivis dans le camion). */
  prochaineExpiration?: string | null;
  id: string;
  vendeurId: string;
  articleId: string;
  quantite: number;
  updatedAt: string;
  article: Article;
}

export interface StockDepotItem {
  articleId: string;
  quantite: number;
  /** Jamais eu de stock et pas encore confirmé « sans stock » (écran « À compléter »). */
  aConfirmer: boolean;
  /** Date d'expiration du lot qui expire en premier (AAAA-MM-JJ), null : aucun lot daté. */
  prochaineExpiration?: string | null;
  /** Pièces qui expirent à cette date. */
  quantiteExpiration?: number | null;
  article: Article;
}

export interface MouvementStock {
  id: string;
  vendeurId: string;
  articleId: string;
  sens: SensMouvement;
  quantite: number;
  reference?: string | null;
  date: string;
  article: Article;
}

/** Synthèse des mouvements d'un article dans un camion (en pièces). */
export interface MouvementsArticle {
  article: Article;
  charge: number;
  retourDepot: number;
  vendu: number;
  retourClient: number;
  /** Somme signée des ajustements (inventaires, annulations, suppressions). */
  ajuste: number;
  nbMouvements: number;
  dernier: string | null;
  /** Stock camion actuel. */
  stock: number;
}

export interface LigneQuantiteInput {
  articleId: string;
  quantite: number;
  unite: UniteSaisie;
}

export interface ChargementInput {
  vendeurId: string;
  sens: "CHARGEMENT" | "RETOUR";
  reference?: string;
  lignes: LigneQuantiteInput[];
}

export interface EntreeDepotInput {
  reference?: string;
  /** dateExpiration (AAAA-MM-JJ) : date des pièces reçues, si elle est connue. */
  lignes: (LigneQuantiteInput & {
    dateExpiration?: string;
    /** Nouveau prix d'achat HT (fournisseur) et prix de vente HT qui en découle. */
    prixAchat?: number;
    prixVente?: number;
  })[];
}

/** Possibilité de supprimer un document (et pourquoi pas). */
export interface Suppression {
  possible: boolean;
  raison?: string;
  /** Possible, mais avec un effet à signaler (ex. stock camion négatif). */
  avertissement?: string;
}

interface Personne {
  id: string;
  nom: string;
  code: string;
  /** Vendeur d'un chargement : véhicule imprimé sur le bon de sortie. */
  voiture?: string | null;
  matriculeVoiture?: string | null;
}

export interface EntreeDepotResume {
  id: string;
  reference?: string | null;
  date: string;
  admin?: Personne | null;
  deletedAt?: string | null;
  nbLignes: number;
  totalPieces: number;
}

export interface EntreeDepotDetail extends EntreeDepotResume {
  lignes: { id: string; articleId: string; quantite: number; article: Article }[];
  suppression: Suppression;
}

export interface ChargementResume {
  id: string;
  vendeurId: string;
  vendeur: Personne;
  sens: "CHARGEMENT" | "RETOUR";
  reference?: string | null;
  date: string;
  deletedAt?: string | null;
  nbLignes: number;
  totalPieces: number;
}

export interface ChargementDetail extends ChargementResume {
  lignes: { id: string; articleId: string; pieces: number; article: Article }[];
  suppression: Suppression;
}

export interface VentesParArticle {
  jours: number;
  depuis: string;
  ventes: { articleId: string; quantite: number; montantHT: number }[];
}
