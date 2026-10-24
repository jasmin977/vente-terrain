import type { ArticleCatalogue, Collecte } from "./stockage";

export class ErreurApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** « 10.0.0.139:3000 » ou « http://10.0.0.139:3000/ » → « http://10.0.0.139:3000 ». */
export function normaliserServeur(saisie: string): string {
  let s = saisie.trim().replace(/\/+$/, "").replace(/\/api$/, "");
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s;
}

// Scan Stock parle aux routes /api/pda du serveur : sans compte, sur le Wi-Fi du dépôt.
async function requete<T>(serveur: string, chemin: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const controle = new AbortController();
  const minuteur = setTimeout(() => controle.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(`${serveur}/api/pda${chemin}`, {
      method: options.method ?? "GET",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controle.signal,
    });
  } catch {
    throw new ErreurApi(0, "Serveur injoignable : vérifiez le Wi-Fi et l'adresse du serveur (menu ☰).");
  } finally {
    clearTimeout(minuteur);
  }
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const corps = await res.json();
      if (typeof corps?.error === "string") message = corps.error;
    } catch {
      // corps non-JSON
    }
    throw new ErreurApi(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface Societe {
  id: string;
  nom: string;
}

export function listerSocietes(serveur: string) {
  return requete<Societe[]>(serveur, "/societes");
}

interface ArticleServeur {
  id: string;
  designation: string;
  code?: string | null;
  codeBarre?: string | null;
  codesBarres?: { codeBarre: string }[];
}

export async function telechargerCatalogue(serveur: string, societeId: string): Promise<ArticleCatalogue[]> {
  const articles = await requete<ArticleServeur[]>(serveur, `/${societeId}/articles`);
  return articles.map((a) => ({
    id: a.id,
    designation: a.designation,
    codes: [a.codeBarre, ...(a.codesBarres ?? []).map((c) => c.codeBarre), a.code].filter((c): c is string => Boolean(c)),
  }));
}

export function envoyerCollecte(serveur: string, c: Collecte) {
  return requete<{ id: string; nbLignes: number }>(serveur, `/${c.societeId}/collectes/${c.id}`, {
    method: "PUT",
    body: { nom: c.nom || null, lignes: c.lignes.map((l) => ({ codeBarre: l.codeBarre, quantite: l.quantite })) },
  });
}

/** Supprime la collecte sur le serveur (seul l'appareil peut supprimer une collecte). */
export function supprimerCollecteServeur(serveur: string, societeId: string, id: string) {
  return requete<void>(serveur, `/${societeId}/collectes/${id}`, { method: "DELETE" });
}

export interface CollecteServeur {
  id: string;
  nom: string | null;
  termineeLe: string;
  importeeLe: string | null;
  importeeDans: string | null;
  nbImports?: number;
  _count: { lignes: number };
}

/** Où en sont les collectes envoyées par cet appareil (importées sur le PC ou en attente). */
export function etatCollectes(serveur: string, societeId: string, ids: string[]) {
  return requete<CollecteServeur[]>(serveur, `/${societeId}/collectes/etat`, { method: "POST", body: { ids } });
}
