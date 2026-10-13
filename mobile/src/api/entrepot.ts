import { apiRequest } from "./client";
import type { EntrepotData, GenerationInput, RackInput } from "../types/entrepot";
import type { VentesEntrepot } from "../utils/ventesEntrepot";

// Plan du dépôt en 3D : réservé à l'admin.

export function getEntrepot(): Promise<EntrepotData> {
  return apiRequest<EntrepotData>("/entrepot");
}

export function modifierBatiment(largeur: number, profondeur: number) {
  return apiRequest<void>("/entrepot", { method: "PUT", body: { largeur, profondeur } });
}

export function creerRack(input: RackInput): Promise<{ id: string }> {
  return apiRequest<{ id: string }>("/entrepot/racks", { method: "POST", body: input });
}

export function modifierRack(id: string, input: Partial<RackInput>) {
  return apiRequest<void>(`/entrepot/racks/${id}`, { method: "PUT", body: input });
}

export function supprimerRack(id: string) {
  return apiRequest<void>(`/entrepot/racks/${id}`, { method: "DELETE" });
}

/** Dispose automatiquement des allées d'étagères. */
export function genererDisposition(input: GenerationInput): Promise<{ racks: number }> {
  return apiRequest<{ racks: number }>("/entrepot/generer", { method: "POST", body: input });
}

/** Quantité d'un article dans une case (0 : le retire de la case). */
export function ranger(rackId: string, niveau: number, travee: number, articleId: string, quantite: number) {
  return apiRequest<void>("/entrepot/emplacements", { method: "PUT", body: { rackId, niveau, travee, articleId, quantite } });
}

/** Range d'un coup les articles en stock sans emplacement, par catégorie. */
export function rangerAuto(): Promise<{ ranges: number }> {
  return apiRequest<{ ranges: number }>("/entrepot/ranger-auto", { method: "POST", body: {} });
}

/** Ventes par article sur les `jours` derniers jours (carte de chaleur). */
export function getVentesEntrepot(jours: number): Promise<VentesEntrepot> {
  return apiRequest<VentesEntrepot>(`/entrepot/ventes?jours=${jours}`);
}
