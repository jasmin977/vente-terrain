// Échanges avec le serveur VenteTerrain (API /api/caisse).
import type { Appairage, ConfigCaisse, FileEnvoi } from "../types";

export class ErreurServeur extends Error {
  constructor(
    message: string,
    public statut: number,
  ) {
    super(message);
  }
}

/** Adresse saisie (« 192.168.1.10:3000 », « https://exemple.tn ») → base de l'API. */
export function normaliserServeur(saisie: string) {
  let s = saisie.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  return s.replace(/\/api$/i, "");
}

async function requete<T>(serveur: string, chemin: string, options: { methode?: string; corps?: unknown; cle?: string; delai?: number } = {}): Promise<T> {
  const ctrl = new AbortController();
  const minuterie = setTimeout(() => ctrl.abort(), options.delai ?? 15_000);
  try {
    const r = await fetch(`${serveur}/api/caisse${chemin}`, {
      method: options.methode ?? (options.corps ? "POST" : "GET"),
      headers: { "content-type": "application/json", ...(options.cle ? { authorization: `Caisse ${options.cle}` } : {}) },
      body: options.corps ? JSON.stringify(options.corps) : undefined,
      signal: ctrl.signal,
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new ErreurServeur((j && (j.error as string)) || `Erreur ${r.status}`, r.status);
    return j as T;
  } catch (err) {
    if (err instanceof ErreurServeur) throw err;
    throw new ErreurServeur("Serveur injoignable", 0);
  } finally {
    clearTimeout(minuterie);
  }
}

export const appairer = (serveur: string, code: string) =>
  requete<Omit<Appairage, "serveur">>(serveur, "/appairer", { corps: { code } });

export const telechargerConfig = (a: Appairage) => requete<ConfigCaisse>(a.serveur, "/config", { cle: a.cle, delai: 60_000 });

export interface ResultatSync {
  sessions: string[];
  tickets: string[];
  mouvements: string[];
  renumerotes: { id: string; numero: number }[];
  erreurs: { id: string; erreur: string }[];
}

export const envoyer = (a: Appairage, file: FileEnvoi) =>
  requete<ResultatSync>(a.serveur, "/sync", {
    cle: a.cle,
    delai: 60_000,
    corps: {
      sessions: Object.values(file.sessions),
      // Seulement les champs attendus par le serveur.
      tickets: file.tickets.map(({ total: _t, designations: _d, ...t }) => t),
      mouvements: file.mouvements,
    },
  });
