import { apiRequest, requeteBrute } from "./client";
import type { ResultatImport, Societe, SocieteInput } from "../types/societe";

export const listSocietes = () => apiRequest<Societe[]>("/societes");
export const getSociete = (id: string) => apiRequest<Societe>(`/societes/${id}`);
export const createSociete = (input: SocieteInput) => apiRequest<Societe>("/societes", { method: "POST", body: input });
export const updateSociete = (id: string, input: Partial<SocieteInput>) =>
  apiRequest<Societe>(`/societes/${id}`, { method: "PUT", body: input });
export const deleteSociete = (id: string) => apiRequest<void>(`/societes/${id}`, { method: "DELETE" });

/** Importe le catalogue de la société courante depuis un fichier Excel (.xlsx en base64). */
export const importerArticles = (fichier: string) =>
  apiRequest<ResultatImport>("/articles/import", { method: "POST", body: { fichier } });

/** Modèle Excel d'import des articles, en base64. */
export async function telechargerModeleArticles(): Promise<string> {
  const res = await requeteBrute("/articles/modele");
  const octets = new Uint8Array(await res.arrayBuffer());
  let binaire = "";
  octets.forEach((b) => (binaire += String.fromCharCode(b)));
  return btoa(binaire);
}
