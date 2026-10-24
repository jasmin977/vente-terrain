import { apiRequest } from "./client";
import type { Promotion, PromotionInput } from "../types/promotion";

export function listPromotions(): Promise<Promotion[]> {
  return apiRequest<Promotion[]>("/promotions");
}

/** Promotions valables aujourd'hui et celles qui commencent dans la semaine (application sur les BL). */
export function listPromotionsActives(): Promise<Promotion[]> {
  return apiRequest<Promotion[]>("/promotions/actives");
}

export function getPromotion(id: string): Promise<Promotion> {
  return apiRequest<Promotion>(`/promotions/${id}`);
}

export function creerPromotion(input: PromotionInput): Promise<Promotion> {
  return apiRequest<Promotion>("/promotions", { method: "POST", body: input });
}

export function modifierPromotion(id: string, input: PromotionInput): Promise<Promotion> {
  return apiRequest<Promotion>(`/promotions/${id}`, { method: "PUT", body: input });
}

/** Arrête une promotion en cours (elle se termine hier). */
export function arreterPromotion(id: string): Promise<Promotion> {
  return apiRequest<Promotion>(`/promotions/${id}/arreter`, { method: "POST" });
}

export function supprimerPromotion(id: string): Promise<void> {
  return apiRequest<void>(`/promotions/${id}`, { method: "DELETE" });
}

interface ChiffresPeriode {
  pieces: number;
  offertes: number;
  ca: number;
  gain: number;
  cout: number;
}

/** Ventes des articles pendant la promotion et sur le même nombre de jours juste avant. */
export interface ResultatsPromotion {
  periode: { avant: { debut: string; fin: string; jours: number }; pendant: { debut: string; fin: string }; jours: number; enCours: boolean };
  totaux: { avant: ChiffresPeriode; pendant: ChiffresPeriode; evolution: number | null };
  articles: { articleId: string; designation: string; offert: boolean; avant: ChiffresPeriode; pendant: ChiffresPeriode; evolution: number | null }[];
  serie: { date: string; pieces: number; periode: "avant" | "pendant" }[];
}

/** null : la promotion n'a pas encore commencé. `joursAvant` : durée de la comparaison (par défaut la même que la promotion). */
export function getResultatsPromotion(id: string, joursAvant?: number): Promise<ResultatsPromotion | null> {
  return apiRequest<ResultatsPromotion | null>(`/promotions/${id}/resultats${joursAvant ? `?avant=${joursAvant}` : ""}`);
}
