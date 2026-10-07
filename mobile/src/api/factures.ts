import { apiRequest } from "./client";
import type { Facture, FactureInput } from "../types/facture";

export interface FactureFilters {
  clientId?: string;
  vendeurId?: string;
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
  if (filters.dateFrom) params.set("dateFrom", debutJour(filters.dateFrom));
  if (filters.dateTo) params.set("dateTo", finJour(filters.dateTo));
  const qs = params.toString();
  return apiRequest<Facture[]>(`/factures${qs ? `?${qs}` : ""}`);
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
