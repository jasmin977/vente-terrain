import { apiRequest } from "./client";
import type { CompteBancaire, CompteBancaireInput, GabaritEffet, TypeEffet } from "../types/effet";

export function listComptesBancaires(): Promise<CompteBancaire[]> {
  return apiRequest<CompteBancaire[]>("/comptes-bancaires");
}

export function creerCompteBancaire(input: CompteBancaireInput): Promise<CompteBancaire> {
  return apiRequest<CompteBancaire>("/comptes-bancaires", { method: "POST", body: input });
}

export function modifierCompteBancaire(id: string, input: CompteBancaireInput): Promise<CompteBancaire> {
  return apiRequest<CompteBancaire>(`/comptes-bancaires/${id}`, { method: "PUT", body: input });
}

export function supprimerCompteBancaire(id: string): Promise<void> {
  return apiRequest<void>(`/comptes-bancaires/${id}`, { method: "DELETE" });
}

/** Réglage de l'impression des chèques ou des traites d'un compte. */
export function enregistrerGabarit(id: string, type: TypeEffet, gabarit: GabaritEffet): Promise<CompteBancaire> {
  return apiRequest<CompteBancaire>(`/comptes-bancaires/${id}/gabarit/${type}`, { method: "PUT", body: gabarit });
}
