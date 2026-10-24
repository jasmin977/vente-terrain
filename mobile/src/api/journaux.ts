import { apiRequest } from "./client";

export type TypeJournal = "ventes" | "achats" | "stock";

/** Ligne d'un journal des ventes ou des achats (un document). */
export interface LigneJournalMontant {
  id: string;
  date: string;
  type: string;
  numero: string;
  tiers: string;
  ht: number;
  tva: number;
  timbre: number;
  ttc: number;
  paye?: number;
  reste?: number;
  annule?: boolean;
  factureNumero?: string | null;
  compte: boolean;
}

/** Ligne du journal du stock (un bon de sortie ou de retour). */
export interface LigneJournalStock {
  id: string;
  date: string;
  type: string;
  numero: string;
  tiers: string;
  nbArticles: number;
  pieces: number;
  valeurAchat: number;
  valeurVente: number;
  compte: boolean;
}

export interface TauxTva {
  taux: number;
  base: number;
  tva: number;
}

export interface JournalMontants {
  lignes: LigneJournalMontant[];
  parTaux: TauxTva[];
}

export interface JournalStock {
  lignes: LigneJournalStock[];
}

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const debutJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T00:00:00`).toISOString() : d);
const finJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T23:59:59.999`).toISOString() : d);

export function getJournal(type: "ventes" | "achats", filtres: Record<string, string | undefined>): Promise<JournalMontants>;
export function getJournal(type: "stock", filtres: Record<string, string | undefined>): Promise<JournalStock>;
export function getJournal(type: TypeJournal, filtres: Record<string, string | undefined>): Promise<JournalMontants | JournalStock> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filtres)) {
    if (!v) continue;
    p.set(k, k === "dateFrom" ? debutJour(v) : k === "dateTo" ? finJour(v) : v);
  }
  return apiRequest(`/journaux/${type}?${p.toString()}`);
}
