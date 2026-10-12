import type { Article } from "./article";

export type StatutInventaire = "EN_COURS" | "VALIDE";
export type MotifEcart = "ENDOMMAGE" | "PERDU" | "ECHANTILLON" | "AUTRE";

interface Personne {
  id: string;
  nom: string;
  code: string;
}

export interface ResumeInventaire {
  nbLignes: number;
  nbComptes: number;
  nbEcarts: number;
  manqueUnites: number;
  surplusUnites: number;
  valeurManque: number;
}

export interface LigneInventaire {
  articleId: string;
  article: Article;
  /** Suit le stock (camion ou dépôt) tant que l'inventaire est en cours ; figée ensuite. */
  quantiteTheorique: number;
  /** null = pas encore compté. */
  quantiteReelle: number | null;
  ecart: number | null;
  motif: MotifEcart | null;
  note: string | null;
}

export type LieuInventaire = "CAMION" | "DEPOT";

export interface InventaireResume {
  id: string;
  /** Camion inventorié ; null = inventaire du dépôt. */
  vendeurId: string | null;
  vendeur: Personne | null;
  lieu: LieuInventaire;
  admin: Personne;
  statut: StatutInventaire;
  note?: string | null;
  createdAt: string;
  dateValidation?: string | null;
  resume: ResumeInventaire;
}

export interface Inventaire extends InventaireResume {
  lignes: LigneInventaire[];
}

export interface LigneInventaireInput {
  quantiteReelle: number;
  motif?: MotifEcart | null;
  note?: string | null;
}
