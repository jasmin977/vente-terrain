export interface Article {
  id: string;
  code: string;
  codeBarre?: string | null;
  designation: string;
  marque?: string | null;
  unit?: string | null;
  img?: string | null;
  /** Absent pour un vendeur : le serveur ne lui envoie jamais le prix d'achat. */
  prixAchat?: number;
  prixVente: number;
  colisage: number;
  tva: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleInput {
  code: string;
  codeBarre?: string;
  designation: string;
  marque?: string;
  unit?: string;
  img?: string;
  prixAchat: number;
  prixVente: number;
  colisage: number;
  tva: number;
}
