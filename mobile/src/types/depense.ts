import type { ModePaiement } from "./facture";

export interface CategorieDepense {
  id: string;
  nom: string;
  ordre: number;
}

/** Dépense de fonctionnement, payée tout de suite. */
export interface Depense {
  id: string;
  date: string;
  categorieId: string;
  categorie: { id: string; nom: string };
  montant: number;
  mode: ModePaiement;
  reference?: string | null;
  description: string;
  fournisseurId?: string | null;
  fournisseur?: { id: string; nom: string; ref: number; divers?: boolean } | null;
  beneficiaire?: string | null;
  vendeurId?: string | null;
  vendeur?: { id: string; nom: string; code: string } | null;
  photo?: string | null;
}

export interface DepenseInput {
  date: string;
  categorieId: string;
  montant: number;
  mode: ModePaiement;
  reference?: string | null;
  description: string;
  fournisseurId?: string | null;
  beneficiaire?: string | null;
  vendeurId?: string | null;
  photo?: string | null;
}
