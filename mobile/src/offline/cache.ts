import type { Article } from "../types/article";
import type { Client } from "../types/client";
import type { CreditClient } from "../types/credit";
import type { Facture } from "../types/facture";
import { ecrire, lire } from "./stockage";

// Dernières données reçues du serveur, utilisées quand le réseau manque. Les
// actions en attente sont appliquées par-dessus à la lecture (voir donnees.ts).
export interface Caches {
  articles: Article[];
  clients: Client[];
  credits: CreditClient[];
  /** Factures du jour du vendeur, telles que renvoyées par le serveur. */
  factures: Facture[];
}

export const lireCache = <K extends keyof Caches>(nom: K) => lire<Caches[K]>(`cache:${nom}`, []);
export const ecrireCache = <K extends keyof Caches>(nom: K, valeur: Caches[K]) => ecrire(`cache:${nom}`, valeur);

export const lireDerniereSync = () => lire<string | null>("derniere-sync", null);
export const ecrireDerniereSync = (iso: string) => ecrire("derniere-sync", iso);

/* ---------------------------------------------------------------- Numérotation */

// Le téléphone numérote lui-même ses factures (V001-26-0007…) pour imprimer un
// ticket définitif sans réseau. Chaque synchronisation recale le compteur sur
// le serveur, sans jamais revenir en arrière.
interface Compteur {
  annee: string;
  prochain: number;
}

const anneeCourte = (d = new Date()) => String(d.getFullYear()).slice(-2);

export async function reserverNumero(codeVendeur: string): Promise<string> {
  const annee = anneeCourte();
  let c = await lire<Compteur | null>("numero", null);
  if (!c || c.annee !== annee) c = { annee, prochain: 1 };
  const numero = `${codeVendeur}-${annee}-${String(c.prochain).padStart(4, "0")}`;
  await ecrire("numero", { annee, prochain: c.prochain + 1 });
  return numero;
}

/** `numero` : prochain numéro selon le serveur (ex. V001-26-0007). */
export async function recalerNumero(numero: string): Promise<void> {
  const m = numero.match(/-(\d{2})-(\d+)$/);
  if (!m) return;
  const [, annee, seq] = m;
  const c = await lire<Compteur | null>("numero", null);
  const prochain = c && c.annee === annee ? Math.max(c.prochain, Number(seq)) : Number(seq);
  await ecrire("numero", { annee, prochain });
}
