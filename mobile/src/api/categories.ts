import { apiRequest } from "./client";
import type { Categorie } from "../types/categorie";

export function listCategories(): Promise<Categorie[]> {
  return apiRequest<Categorie[]>("/categories");
}

export function createCategorie(nom: string, parentId?: string | null): Promise<Categorie> {
  return apiRequest<Categorie>("/categories", { method: "POST", body: { nom, parentId: parentId ?? null } });
}

export function updateCategorie(id: string, input: { nom?: string; parentId?: string | null; perissable?: boolean; alerteJours?: number | null; froid?: boolean }): Promise<Categorie> {
  return apiRequest<Categorie>(`/categories/${id}`, { method: "PUT", body: input });
}

export function deleteCategorie(id: string): Promise<void> {
  return apiRequest<void>(`/categories/${id}`, { method: "DELETE" });
}

/** Classe des articles dans une catégorie (null : les retirer de leur catégorie). */
export function classerArticles(articleIds: string[], categorieId: string | null): Promise<{ classes: number }> {
  return apiRequest<{ classes: number }>("/categories/classer", { method: "POST", body: { articleIds, categorieId } });
}
