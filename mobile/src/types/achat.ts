import type { ModePaiement } from "./facture";

/** ENTREE : bon d'entrée, achat sans papier légal (numéro automatique, fournisseur facultatif). */
export type TypeAchat = "BL" | "FACTURE" | "ENTREE";
/** FACTURE : BL regroupé dans une facture fournisseur (c'est la facture qui se règle). */
export type StatutPaiement = "PAYE" | "PARTIEL" | "NON_PAYE" | "FACTURE";

export interface Fournisseur {
  id: string;
  ref: number;
  nom: string;
  /** Fournisseur « Divers » intégré (achats ponctuels). */
  divers?: boolean;
  matriculeFiscal?: string | null;
  telephone?: string | null;
  email?: string | null;
  adresse?: string | null;
  ville?: string | null;
  contact?: string | null;
  notes?: string | null;
  /** Reste à payer sur ses documents. */
  du: number;
  nbImpayes: number;
  /** Avances versées sans document. */
  avances: number;
  /** du − avances. */
  solde: number;
}

export type FournisseurInput = Partial<Omit<Fournisseur, "id" | "ref" | "divers" | "du" | "nbImpayes" | "avances" | "solde">> & { nom: string };

export interface FournisseurResume {
  id: string;
  nom: string;
  ref: number;
  divers?: boolean;
  matriculeFiscal?: string | null;
  adresse?: string | null;
  ville?: string | null;
  telephone?: string | null;
  email?: string | null;
}

export interface LigneAchat {
  id: string;
  articleId?: string | null;
  article?: { id: string; designation: string; code?: string | null; codeBarre?: string | null } | null;
  designation: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  montantHT: number;
  montantTTC: number;
  dateExpiration?: string | null;
}

export interface Achat {
  id: string;
  type: TypeAchat;
  fournisseurId: string;
  fournisseur: FournisseurResume;
  numero: string;
  /** Achat « Divers » : chez qui. */
  fournisseurLibre?: string | null;
  date: string;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  /** Droit de timbre : 1 TND sur une facture, 0 sur un BL. Net à payer = TTC + timbre. */
  timbre: number;
  notes?: string | null;
  factureId?: string | null;
  facture?: { id: string; numero: string } | null;
  _count?: { bons: number };
  paye: number;
  reste: number;
  statut: StatutPaiement;
}

export interface AchatDetail extends Achat {
  lignes: LigneAchat[];
  reglements: ReglementFournisseur[];
  bons: { id: string; numero: string; date: string; montantTTC: number }[];
}

export interface LigneAchatInput {
  articleId?: string | null;
  designation: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  /** AAAA-MM-JJ. */
  dateExpiration?: string | null;
  /** Nouveau prix de vente HT choisi à la saisie. */
  prixVente?: number;
}

export interface AchatInput {
  type: TypeAchat;
  /** BL / facture : numéro du papier du fournisseur. B° Entrée : automatique. */
  numero?: string;
  /** Facultatif pour un B° Entrée. */
  fournisseurId?: string;
  fournisseurLibre?: string;
  date: string;
  notes?: string;
  lignes: LigneAchatInput[];
}

export interface ReglementFournisseur {
  id: string;
  fournisseurId: string;
  fournisseur?: { id: string; nom: string; ref: number; divers?: boolean };
  achatId?: string | null;
  achat?: { id: string; type: TypeAchat; numero: string; date?: string; fournisseurLibre?: string | null } | null;
  montant: number;
  mode: ModePaiement;
  reference?: string | null;
  date: string;
  /** Traite : date d'échéance. */
  echeance?: string | null;
  notes?: string | null;
  /** Chèque / traite imprimé par l'app. */
  compteBancaireId?: string | null;
  compteBancaire?: { id: string; banque: string } | null;
  imprimeLe?: string | null;
  impression?: Record<string, string | boolean | null> | null;
}

export interface ReglementInput {
  fournisseurId: string;
  achatId?: string | null;
  montant: number;
  mode: ModePaiement;
  reference?: string;
  date: string;
  notes?: string;
  /** Traite : date d'échéance (AAAA-MM-JJ). */
  echeance?: string;
}

export interface DocumentImpaye {
  id: string;
  type: TypeAchat;
  numero: string;
  date: string;
  montantTTC: number;
  timbre: number;
  fournisseurLibre?: string | null;
  paye: number;
  reste: number;
  statut: StatutPaiement;
}

export interface ImpayesFournisseur {
  fournisseur: { id: string; nom: string; ref: number; divers?: boolean };
  documents: DocumentImpaye[];
  totalDu: number;
  plusAncien: string;
  avances: number;
  solde: number;
}
