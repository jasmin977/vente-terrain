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
  /** Dépôt : catégories inventoriées (vide = tout le dépôt). */
  categorieIds?: string[];
  /** « Boissons › Eaux », « Tout le dépôt ». */
  libelle?: string | null;
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

/** Suivi d'une catégorie pour l'inventaire tournant du dépôt. */
export interface SuiviCategorie {
  id: string;
  nom: string;
  /** « Boissons › Eaux ». */
  chemin: string;
  parentId: string | null;
  nbArticles: number;
  dernierInventaire: { id: string; date: string; libelle: string | null } | null;
  /** Jours depuis le dernier inventaire terminé ; null : jamais. */
  joursDepuis: number | null;
  /** principal : lancé sur cette catégorie ; sinon elle est incluse dans l'inventaire d'une catégorie parente (ou du dépôt). */
  enCours: { id: string; libelle: string | null; principal?: boolean } | null;
}
