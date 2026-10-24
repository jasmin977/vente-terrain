/** Autre code-barres d'un article (variante : saveur, couleur, modèle…). */
export interface CodeBarreAlternatif {
  id?: string;
  codeBarre: string;
  libelle?: string | null;
}

export interface Article {
  id: string;
  /** Réf : facultative. */
  code?: string | null;
  codeBarre?: string | null;
  /** Autres codes-barres du même produit (variantes) : les scanner ramène cet article. */
  codesBarres?: CodeBarreAlternatif[];
  designation: string;
  marque?: string | null;
  unit?: string | null;
  img?: string | null;
  /** Absent pour un vendeur : le serveur ne lui envoie jamais le prix d'achat. */
  prixAchat?: number;
  prixVente: number;
  colisage: number;
  tva: number;
  /** FODEC en % du prix HT (0 ou 1) : la TVA se calcule sur HT + FODEC. */
  fodec?: number;
  /** Prix de gros HT (facultatif). */
  prixGros?: number | null;
  /** Catégorie (la plus précise : sous-catégorie si elle existe). */
  categorieId?: string | null;
  stockMini?: number | string | null;
  etiquette?: "NOUVEAU" | "PROMOTION" | null;
  etiquetteJusqua?: string | null;
  /** Date à laquelle l'admin a confirmé que l'article n'a aucun stock au dépôt. */
  stockVerifieAt?: string | null;
  /** Quantité au dépôt : fiche article de l'admin seulement. */
  stockDepot?: number;
  /** Position dans le catalogue (ordre du fichier importé). */
  ordre?: number | null;
  createdAt: string;
  updatedAt: string;
}

/** Un changement de prix d'un article (les prix en vigueur à partir de `date`). */
export interface PrixHistorique {
  id: string;
  date: string;
  source: "CREATION" | "MODIFICATION" | "ENTREE" | "IMPORT";
  /** N° du bon d'entrée à l'origine du changement. */
  reference: string | null;
  prixAchat: number;
  prixVenteHT: number;
  prixVenteTTC: number;
  /** % du prix d'achat (null sans prix d'achat). */
  marge: number | null;
}

export interface ArticleInput {
  /** Réf : facultative (vide = aucune). */
  code: string;
  /** Obligatoire. */
  codeBarre: string;
  /** Autres codes-barres (variantes) ; à l'enregistrement, cette liste remplace l'ancienne. */
  codesBarres?: CodeBarreAlternatif[];
  designation: string;
  marque?: string;
  unit?: string;
  img?: string;
  prixAchat: number;
  prixVente: number;
  colisage: number;
  tva: number;
  fodec: number;
  prixGros: number | null;
  categorieId?: string | null;
  /** Stock minimum en pièces, saisi en colis (null : 5 colis) : en dessous, « stock bas » sur le plan 3D. */
  stockMini?: number | null;
  /** Mise en avant (bleu sur le plan 3D), jusqu'à une date AAAA-MM-JJ (null : sans fin). */
  etiquette?: "NOUVEAU" | "PROMOTION" | null;
  etiquetteJusqua?: string | null;
}
