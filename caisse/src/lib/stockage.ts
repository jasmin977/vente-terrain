// Stockage local : fichiers JSON écrits par Electron (dossier de l'application) ; dans un simple navigateur
// (développement), le localStorage.

interface PontCaisse {
  lire: (cle: string) => Promise<unknown>;
  ecrire: (cle: string, valeur: unknown) => Promise<boolean>;
  info: () => Promise<{ version: string; dossier: string; dev: boolean }>;
  quitter: () => Promise<void>;
  pleinEcran: () => Promise<void>;
  imprimantes: () => Promise<{ nom: string; parDefaut: boolean }[]>;
  imprimer: (html: string, imprimante?: string | null) => Promise<{ ok: boolean; erreur?: string }>;
}

declare global {
  interface Window {
    caisseApp?: PontCaisse;
  }
}

export const pont = (): PontCaisse | undefined => window.caisseApp;

export async function lire<T>(cle: string): Promise<T | null> {
  const p = pont();
  if (p) return (await p.lire(cle)) as T | null;
  try {
    const v = localStorage.getItem(`caisse:${cle}`);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

// Écritures d'une même clé mises en file : la dernière valeur gagne toujours, dans l'ordre.
const files = new Map<string, Promise<unknown>>();
export function ecrire(cle: string, valeur: unknown): Promise<unknown> {
  const p = pont();
  const precedente = files.get(cle) ?? Promise.resolve();
  const suivante = precedente
    .catch(() => undefined)
    .then(() => {
      if (p) return p.ecrire(cle, valeur);
      localStorage.setItem(`caisse:${cle}`, JSON.stringify(valeur));
      return true;
    });
  files.set(cle, suivante);
  return suivante;
}
