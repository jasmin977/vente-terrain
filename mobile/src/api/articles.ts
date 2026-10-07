import { apiRequest } from "./client";
import type { Article, ArticleInput } from "../types/article";

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
