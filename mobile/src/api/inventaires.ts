import { apiRequest } from "./client";
import type { Inventaire, InventaireResume, LigneInventaireInput } from "../types/inventaire";

export function listInventaires(vendeurId?: string): Promise<InventaireResume[]> {
  return apiRequest<InventaireResume[]>(`/inventaires${vendeurId ? `?vendeurId=${vendeurId}` : ""}`);
}

export function getInventaire(id: string): Promise<Inventaire> {
  return apiRequest<Inventaire>(`/inventaires/${id}`);
}

/** Ouvre un inventaire pour ce camion, ou reprend celui déjà en cours. */
export function ouvrirInventaire(vendeurId: string): Promise<{ id: string }> {
  return apiRequest<{ id: string }>("/inventaires", { method: "POST", body: { vendeurId } });
}

export function enregistrerComptage(id: string, articleId: string, input: LigneInventaireInput) {
  return apiRequest(`/inventaires/${id}/lignes/${articleId}`, { method: "PUT", body: input });
}

export function retirerComptage(id: string, articleId: string) {
  return apiRequest<void>(`/inventaires/${id}/lignes/${articleId}`, { method: "DELETE" });
}

export function validerInventaire(id: string): Promise<Inventaire> {
  return apiRequest<Inventaire>(`/inventaires/${id}/valider`, { method: "POST" });
}

export function abandonnerInventaire(id: string) {
  return apiRequest<void>(`/inventaires/${id}`, { method: "DELETE" });
}
