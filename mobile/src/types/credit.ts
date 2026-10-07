import type { ModePaiement } from "./facture";

export interface ClientCredit {
  id: string;
  code: string;
  nomCommerce: string;
  ville?: string | null;
  telephone?: string | null;
}

export interface FactureCredit {
  id: string;
  numero: string;
  date: string;
  vendeur: { id: string; nom: string; code: string };
  montantTTC: number;
  /** Déjà réglé (paiements de la facture + avances imputées, plus anciennes d'abord). */
  paye: number;
  reste: number;
}

export interface CreditClient {
  client: ClientCredit;
  totalDu: number;
  factures: FactureCredit[];
}

export interface EncaissementCredit {
  id: string;
  montant: number;
  mode: ModePaiement;
  date: string;
  reference?: string | null;
  facture: { id: string; numero: string } | null;
  vendeur: { id: string; nom: string; code: string };
}

export interface SituationCreditClient extends CreditClient {
  paiements: EncaissementCredit[];
}

export interface EncaissementInput {
  mode: ModePaiement;
  /** ISO ; absent = maintenant. */
  date?: string;
  reference?: string;
}
