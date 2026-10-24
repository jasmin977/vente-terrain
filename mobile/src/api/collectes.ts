import { apiRequest } from "./client";

/** Collecte terminée sur le PDA (application « Collecte »), pas encore importée. */
export interface CollecteResume {
  id: string;
  nom: string | null;
  termineeLe: string;
  /** Compte d'envoi ; vide pour Scan Stock (dépôt, sans compte). */
  user: { id: string; nom: string; code: string } | null;
  appareil?: string | null;
  nbLignes: number;
  totalQuantite: number;
  /** Dernier import dans un formulaire (la collecte reste réimportable). */
  importeeLe?: string | null;
  importeeDans?: string | null;
  nbImports?: number;
}

export interface LigneCollecteImport {
  codeBarre: string;
  quantite: number;
  /** Article du catalogue qui porte ce code ; null : code inconnu. */
  articleId: string | null;
  designation: string | null;
}

export interface CollecteDetail extends Omit<CollecteResume, "nbLignes" | "totalQuantite"> {
  lignes: LigneCollecteImport[];
}

export function listCollectes(): Promise<CollecteResume[]> {
  return apiRequest<CollecteResume[]>("/collectes");
}

export function getCollecte(id: string): Promise<CollecteDetail> {
  return apiRequest<CollecteDetail>(`/collectes/${id}`);
}

/** Note l'import (la collecte reste proposée : elle se réimporte autant de fois que voulu). */
export function marquerCollecteImportee(id: string, destination: string): Promise<void> {
  return apiRequest<void>(`/collectes/${id}/importee`, { method: "POST", body: { destination } });
}
