import { apiRequest } from "./client";
import { dateDocument } from "./achats";
import type { CategorieDepense, Depense, DepenseInput } from "../types/depense";
import type { ModePaiement } from "../types/facture";

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const debutJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T00:00:00`).toISOString() : d);
const finJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T23:59:59.999`).toISOString() : d);

export interface DepenseFilters {
  dateFrom?: string;
  dateTo?: string;
  categorieId?: string;
  mode?: ModePaiement;
  vendeurId?: string;
}

export function listDepenses(f: DepenseFilters = {}): Promise<Depense[]> {
  const p = new URLSearchParams();
  if (f.dateFrom) p.set("dateFrom", debutJour(f.dateFrom));
  if (f.dateTo) p.set("dateTo", finJour(f.dateTo));
  if (f.categorieId) p.set("categorieId", f.categorieId);
  if (f.mode) p.set("mode", f.mode);
  if (f.vendeurId) p.set("vendeurId", f.vendeurId);
  const qs = p.toString();
  return apiRequest<Depense[]>(`/depenses${qs ? `?${qs}` : ""}`);
}

export function createDepense(input: DepenseInput): Promise<Depense> {
  return apiRequest<Depense>("/depenses", { method: "POST", body: { ...input, date: dateDocument(input.date) } });
}

export function updateDepense(id: string, input: DepenseInput): Promise<Depense> {
  return apiRequest<Depense>(`/depenses/${id}`, { method: "PUT", body: { ...input, date: dateDocument(input.date) } });
}

export function deleteDepense(id: string): Promise<void> {
  return apiRequest<void>(`/depenses/${id}`, { method: "DELETE" });
}

export function listCategoriesDepense(): Promise<CategorieDepense[]> {
  return apiRequest<CategorieDepense[]>("/depenses/categories");
}

export function createCategorieDepense(nom: string): Promise<CategorieDepense> {
  return apiRequest<CategorieDepense>("/depenses/categories", { method: "POST", body: { nom } });
}

export function renommerCategorieDepense(id: string, nom: string): Promise<CategorieDepense> {
  return apiRequest<CategorieDepense>(`/depenses/categories/${id}`, { method: "PUT", body: { nom } });
}

export function deleteCategorieDepense(id: string): Promise<void> {
  return apiRequest<void>(`/depenses/categories/${id}`, { method: "DELETE" });
}
