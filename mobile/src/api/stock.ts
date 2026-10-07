import { apiRequest } from "./client";
import type {
  ChargementDetail,
  ChargementInput,
  ChargementResume,
  EntreeDepotDetail,
  EntreeDepotInput,
  EntreeDepotResume,
  MouvementsArticle,
  MouvementStock,
  StockCamionItem,
  StockDepotItem,
  VentesParArticle,
} from "../types/stock";

// Module stock : réservé à l'admin (le vendeur ne voit pas le stock de son camion).

/** Période en instants ISO (bornes calculées dans le fuseau du téléphone). */
export interface PlageDates {
  dateFrom: string;
  dateTo: string;
}

const plageQuery = (p?: PlageDates) =>
  p ? `&dateFrom=${encodeURIComponent(p.dateFrom)}&dateTo=${encodeURIComponent(p.dateTo)}` : "";

export function getStockCamion(vendeurId: string): Promise<StockCamionItem[]> {
  return apiRequest<StockCamionItem[]>(`/stock/camion?vendeurId=${vendeurId}`);
}

/** Mouvements d'un camion ; avec `articleId`, tout l'historique de l'article (du plus ancien au plus récent). */
export function getMouvements(vendeurId: string, articleId?: string): Promise<MouvementStock[]> {
  return apiRequest<MouvementStock[]>(`/stock/mouvements?vendeurId=${vendeurId}${articleId ? `&articleId=${articleId}` : ""}`);
}

/** Synthèse par article des mouvements d'un camion. */
export function getMouvementsParArticle(vendeurId: string, plage?: PlageDates): Promise<MouvementsArticle[]> {
  return apiRequest<MouvementsArticle[]>(`/stock/mouvements/articles?vendeurId=${vendeurId}${plageQuery(plage)}`);
}

export function getStockDepot(): Promise<StockDepotItem[]> {
  return apiRequest<StockDepotItem[]>("/stock/depot");
}

export function createEntreeDepot(input: EntreeDepotInput) {
  return apiRequest("/stock/depot/entree", { method: "POST", body: input });
}

export function createChargement(input: ChargementInput) {
  return apiRequest("/stock/chargement", { method: "POST", body: input });
}

// ---- Historique (suppression = stock rétabli, document conservé marqué supprimé)

export function listEntreesDepot(): Promise<EntreeDepotResume[]> {
  return apiRequest<EntreeDepotResume[]>("/stock/depot/entrees");
}

export function getEntreeDepot(id: string): Promise<EntreeDepotDetail> {
  return apiRequest<EntreeDepotDetail>(`/stock/depot/entrees/${id}`);
}

export function supprimerEntreeDepot(id: string) {
  return apiRequest<void>(`/stock/depot/entrees/${id}`, { method: "DELETE" });
}

export function listChargements(vendeurId: string, plage?: PlageDates): Promise<ChargementResume[]> {
  return apiRequest<ChargementResume[]>(`/stock/chargements?vendeurId=${vendeurId}${plageQuery(plage)}`);
}

export function getChargement(id: string): Promise<ChargementDetail> {
  return apiRequest<ChargementDetail>(`/stock/chargements/${id}`);
}

export function supprimerChargement(id: string) {
  return apiRequest<void>(`/stock/chargements/${id}`, { method: "DELETE" });
}

/** Quantités vendues par article sur les `jours` derniers jours (factures validées, tous vendeurs). */
export function getVentesParArticle(jours = 30): Promise<VentesParArticle> {
  return apiRequest<VentesParArticle>(`/stock/ventes-par-article?jours=${jours}`);
}
