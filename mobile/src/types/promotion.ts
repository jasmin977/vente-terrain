/** Promotions (Commercial › Promotions) : prix promo sur une période, ou vente en lot. */
export type TypePromotion = "PRIX" | "LOT";
export type ModeLot = "CADEAU" | "UN_PLUS_UN" | "DEUXIEME_MOITIE" | "N_PLUS_UN" | "PRIX_LOT";
export type StatutPromotion = "EN_COURS" | "A_VENIR" | "TERMINEE";

export interface ArticlePromo {
  id: string;
  designation: string;
  codeBarre?: string | null;
  /** Réservé à l'admin (jamais envoyé aux vendeurs). */
  prixAchat?: number | string | null;
  prixVente: number | string;
  tva: number | string;
  fodec?: number | string | null;
  colisage?: number;
  img?: string | null;
}

export interface LignePromotion {
  id?: string;
  articleId: string;
  article?: ArticlePromo;
  /** Prix : nouveau prix de vente HT. */
  prixPromo?: number | null;
  /** Article offert et quantité offerte pour une pièce achetée. */
  articleOffertId?: string | null;
  articleOffert?: ArticlePromo | null;
  quantiteOfferte?: number | null;
  /** N + 1 : pièces achetées pour une offerte. */
  seuil?: number | null;
  /** Prix du lot : taille et prix HT du lot. */
  tailleLot?: number | null;
  prixLot?: number | null;
}

export interface Promotion {
  id: string;
  type: TypePromotion;
  mode?: ModeLot | null;
  /** PR-26/0001, LT-26/0001 */
  numero: string;
  libelle?: string | null;
  /** AAAA-MM-JJ */
  dateDebut: string;
  dateFin: string;
  statut: StatutPromotion;
  lignes: LignePromotion[];
  /** Liste : évolution des pièces vendues (%) par rapport à la même durée juste avant (null : pas de comparaison). */
  evolution?: number | null;
}

export interface PromotionInput {
  type: TypePromotion;
  mode?: ModeLot | null;
  libelle?: string | null;
  dateDebut: string;
  dateFin: string;
  lignes: Omit<LignePromotion, "id" | "article" | "articleOffert">[];
}
