import { apiRequest } from "./client";
import type { Facture, FactureInput, LigneFacture } from "../types/facture";

export interface FactureFilters {
  clientId?: string;
  vendeurId?: string;
  /** Seulement les bons pas encore transformés en facture. */
  aFacturer?: boolean;
  dateFrom?: string;
  dateTo?: string;
}

// Un jour « AAAA-MM-JJ » s'entend dans le fuseau du téléphone : on envoie les
// instants exacts de début et de fin de journée, sinon le serveur les lirait
// dans son propre fuseau (ou en UTC) et décalerait les factures du soir.
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const debutJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T00:00:00`).toISOString() : d);
const finJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T23:59:59.999`).toISOString() : d);

export function listFactures(filters: FactureFilters = {}): Promise<Facture[]> {
  const params = new URLSearchParams();
  if (filters.clientId) params.set("clientId", filters.clientId);
  if (filters.vendeurId) params.set("vendeurId", filters.vendeurId);
  if (filters.aFacturer) params.set("aFacturer", "1");
  if (filters.dateFrom) params.set("dateFrom", debutJour(filters.dateFrom));
  if (filters.dateTo) params.set("dateTo", finJour(filters.dateTo));
  const qs = params.toString();
  return apiRequest<Facture[]>(`/factures${qs ? `?${qs}` : ""}`);
}

/** Facture établie à partir de bons de livraison (Ventes > Transformation BL en Facture). */
export interface FactureVente {
  id: string;
  numero: string;
  date: string;
  montantHT: number;
  montantTVA: number;
  montantTTC: number;
  /** Droit de timbre (TND) : net à payer = TTC + timbre. */
  timbre?: number;
  /** Client des bons regroupés ; absent si la facture mélange plusieurs clients. */
  client?: { id: string; nomCommerce: string; code: string; ref?: number; adresse?: string | null; ville?: string | null; telephone?: string | null } | null;
}

/** Facture complète : lignes regroupées et bons d'origine (chacun avec ses articles). */
export interface FactureVenteDetail extends FactureVente {
  lignes: LigneFacture[];
  bons: { id: string; numero: string; date: string; montantHT: number; montantTTC: number; lignes: LigneFacture[] }[];
}

export function listFacturesVente(filters: { dateFrom?: string; dateTo?: string } = {}): Promise<FactureVente[]> {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set("dateFrom", debutJour(filters.dateFrom));
  if (filters.dateTo) params.set("dateTo", finJour(filters.dateTo));
  const qs = params.toString();
  return apiRequest<FactureVente[]>(`/factures-vente${qs ? `?${qs}` : ""}`);
}

export function getFactureVente(id: string): Promise<FactureVenteDetail> {
  return apiRequest<FactureVenteDetail>(`/factures-vente/${id}`);
}

export function modifierDateFactureVente(id: string, date: string): Promise<void> {
  return apiRequest<void>(`/factures-vente/${id}`, { method: "PUT", body: { date } });
}

export function supprimerFactureVente(id: string): Promise<void> {
  return apiRequest<void>(`/factures-vente/${id}`, { method: "DELETE" });
}

export function prochainNumeroFactureVente(annee: number): Promise<{ numero: string }> {
  return apiRequest<{ numero: string }>(`/factures-vente/numero-suivant?annee=${annee}`);
}

export function transformerEnFacture(input: { date: string; bonIds: string[] }): Promise<FactureVente> {
  return apiRequest<FactureVente>("/factures-vente", { method: "POST", body: input });
}

export function getFacture(id: string): Promise<Facture> {
  return apiRequest<Facture>(`/factures/${id}`);
}

export function createFacture(input: FactureInput): Promise<Facture> {
  return apiRequest<Facture>("/factures", { method: "POST", body: input });
}

export function annulerFacture(id: string): Promise<void> {
  return apiRequest<void>(`/factures/${id}/annuler`, { method: "POST" });
}
