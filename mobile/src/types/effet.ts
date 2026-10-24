/** Chèque ou traite (lettre de change) imprimé par l'app sur le papier de la banque. */
export type TypeEffet = "CHEQUE" | "TRAITE";

/** Case du papier où un texte s'imprime (mm, depuis le coin haut gauche du papier). */
export interface ChampGabarit {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
  /** Taille du texte (pt) ; réduite automatiquement si le texte ne tient pas dans la case. */
  taille: number;
  alignement?: "gauche" | "centre" | "droite";
  /** Nombre de lignes permises (nom et adresse du tiré, domiciliation…). */
  lignes?: number;
  /** Espace entre les caractères (mm). */
  espacement?: number;
  gras?: boolean;
  /** Pas imprimé (case absente de ce modèle de papier). */
  masque?: boolean;
}

/** Réglage d'impression d'un modèle de papier, fait une fois par compte bancaire. */
export interface GabaritEffet {
  /** Modèle de cases (2) : un réglage plus ancien est remplacé par les cases par défaut. */
  version?: number;
  /** Taille du papier (mm). */
  largeur: number;
  hauteur: number;
  /** EFFET : la page a la taille du papier (bac réglé sur le petit format). A4 : papier posé en haut à gauche d'une page A4. */
  papier: "EFFET" | "A4";
  /** Calage de toute l'impression (mm) quand l'imprimante décale. */
  decalageX: number;
  decalageY: number;
  /** Impression retournée de 180° (papier introduit tête en bas). */
  rotation?: boolean;
  champs: Record<string, ChampGabarit>;
}

export interface CompteBancaire {
  id: string;
  banque: string;
  agence?: string | null;
  rib: string;
  titulaire?: string | null;
  ville?: string | null;
  parDefaut: boolean;
  gabarits?: Partial<Record<TypeEffet, GabaritEffet>> | null;
}

export interface CompteBancaireInput {
  banque: string;
  agence?: string | null;
  rib: string;
  titulaire?: string | null;
  ville?: string | null;
  parDefaut?: boolean;
}

/** Ce qui est imprimé (saisi ou proposé). */
export interface ValeursEffet {
  /** N° du chèque / de la traite (pré-imprimé sur le papier : devient la référence du règlement). */
  numero: string;
  montant: number;
  ordre: string;
  /** AAAA-MM-JJ */
  dateCreation: string;
  lieu: string;
  /** Traite : AAAA-MM-JJ */
  echeance: string;
  payeur: string;
  monnaie: string;
}
