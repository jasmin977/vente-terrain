import type { Article } from "./article";

export type StatutLot = "EXPIRE" | "PROCHE" | "OK";

/** Lot du dépôt avec date d'expiration (une quantité d'un article qui expire le même jour). */
export interface LotPeremption {
  id: string;
  articleId: string;
  article: Article;
  /** AAAA-MM-JJ */
  dateExpiration: string;
  quantite: number;
  /** Négatif : déjà expiré. */
  joursRestants: number;
  alerteJours: number;
  statut: StatutLot;
}

/** Article périssable dont des pièces n'ont pas encore de date. */
export interface ArticleADater {
  articleId: string;
  article: Article;
  quantiteSansDate: number;
}

export interface Peremption {
  resume: { expires: number; proches: number; aDater: number };
  lots: LotPeremption[];
  aDater: ArticleADater[];
}
