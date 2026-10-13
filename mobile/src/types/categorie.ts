/** Nœud de l'arbre de catégories d'une société : catégorie (parentId null) ou sous-catégorie. */
export interface Categorie {
  id: string;
  nom: string;
  parentId: string | null;
  ordre: number;
  /** Articles directement rangés ici (sans compter les sous-catégories). */
  nbArticles: number;
  /** Les dates d'expiration des articles de cette catégorie sont suivies (hérité par les sous-catégories). */
  perissable?: boolean;
  /** Jours avant l'expiration où un lot est signalé (30 par défaut). */
  alerteJours?: number | null;
  /** Produits frais : rangés dans la chambre froide du dépôt (hérité par les sous-catégories). */
  froid?: boolean;
}
