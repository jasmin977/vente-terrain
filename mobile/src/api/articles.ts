import { apiRequest } from "./client";
import type { Article, ArticleInput, PrixHistorique } from "../types/article";

export interface ArticleFilters {
  q?: string;
  codeBarre?: string;
}

export function listArticles(filters: ArticleFilters = {}): Promise<Article[]> {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.codeBarre) params.set("codeBarre", filters.codeBarre);
  const qs = params.toString();
  return apiRequest<Article[]>(`/articles${qs ? `?${qs}` : ""}`);
}

export interface InfosCodeBarre {
  nom: string | null;
  marque: string | null;
  quantite: string | null;
  img: string | null;
}

/** Nom, marque, contenance et photo d'un produit d'après son code-barres (bases ouvertes), ou null. */
export function infosCodeBarre(code: string): Promise<{ infos: InfosCodeBarre | null }> {
  return apiRequest<{ infos: InfosCodeBarre | null }>(`/articles/infos-code-barre?code=${encodeURIComponent(code)}`);
}

/** Articles sans photo dont la recherche en ligne n'a pas encore été faite. */
export function photosACercher(): Promise<{ ids: string[] }> {
  return apiRequest<{ ids: string[] }>("/articles/photos-a-chercher");
}

export interface ResultatPhoto {
  id: string;
  statut: "trouvee" | "absente" | "erreur" | "ignoree";
  img?: string;
}

/** Cherche la photo (par code-barres) de quelques articles, 8 au plus. */
export function trouverPhotos(articleIds: string[]): Promise<{ resultats: ResultatPhoto[] }> {
  return apiRequest<{ resultats: ResultatPhoto[] }>("/articles/photos-trouver", { method: "POST", body: { articleIds } });
}

/** La société utilise-t-elle les références (Réf) ? */
export function referencesUtilisees(): Promise<{ utilisee: boolean }> {
  return apiRequest<{ utilisee: boolean }>("/articles/references-utilisees");
}

export function getHistoriquePrix(id: string): Promise<PrixHistorique[]> {
  return apiRequest<PrixHistorique[]>(`/articles/${id}/prix-historique`);
}

export function getArticle(id: string): Promise<Article> {
  return apiRequest<Article>(`/articles/${id}`);
}

export function createArticle(input: ArticleInput): Promise<Article> {
  return apiRequest<Article>("/articles", { method: "POST", body: input });
}

export function updateArticle(id: string, input: Partial<ArticleInput>): Promise<Article> {
  return apiRequest<Article>(`/articles/${id}`, { method: "PUT", body: input });
}

export function deleteArticle(id: string): Promise<void> {
  return apiRequest<void>(`/articles/${id}`, { method: "DELETE" });
}
