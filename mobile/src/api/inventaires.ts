import { apiRequest } from "./client";
import type { Inventaire, InventaireResume, LigneInventaireInput, SuiviCategorie } from "../types/inventaire";

/** Valeur désignant le dépôt dans une cible d'inventaire (sinon : id du vendeur du camion). */
export const DEPOT = "depot";

/** Inventaires du dépôt, ou des camions (d'un seul si `vendeurId` est donné). */
export function listInventaires(lieu: "DEPOT" | "CAMION", vendeurId?: string): Promise<InventaireResume[]> {
  const q = new URLSearchParams({ lieu });
  if (lieu === "CAMION" && vendeurId) q.set("vendeurId", vendeurId);
  return apiRequest<InventaireResume[]>(`/inventaires?${q}`);
}

export function getInventaire(id: string): Promise<Inventaire> {
  return apiRequest<Inventaire>(`/inventaires/${id}`);
}

/** Ouvre un inventaire pour ce camion (ou pour le dépôt), ou reprend celui déjà en cours. */
/** Dépôt : `categorieIds` = catégories à inventorier (avec leurs sous-catégories) ; vide = tout le dépôt. */
export function ouvrirInventaire(cible: string, categorieIds: string[] = []): Promise<{ id: string }> {
  const body = cible === DEPOT ? { lieu: "DEPOT", categorieIds } : { vendeurId: cible };
  return apiRequest<{ id: string }>("/inventaires", { method: "POST", body });
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

/** Dépôt : chaque catégorie avec la date de son dernier inventaire terminé (inventaire tournant). */
export function getSuiviCategories(): Promise<SuiviCategorie[]> {
  return apiRequest<SuiviCategorie[]>("/inventaires/suivi-categories");
}
