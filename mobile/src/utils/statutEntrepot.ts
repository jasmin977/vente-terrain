import type { ArticleRange, Emplacement, EntrepotData, Rack } from "../types/entrepot";
import { t } from "../i18n";

/**
 * Statut de stock d'un article au dépôt (calculé par le serveur, backend/src/lib/statutStock.ts), affiché en
 * couleur sur le plan 3D : rouge = rupture, orange = stock bas, bleu = nouveauté / promotion, vert = suffisant.
 */
export type StatutStock = "RUPTURE" | "BAS" | "NOUVEAU" | "OK";

/** Du plus urgent au moins urgent. */
export const ORDRE_STATUTS: StatutStock[] = ["RUPTURE", "BAS", "NOUVEAU", "OK"];

/** Couleurs du plan 3D (valeurs lues par three.js) et des pastilles de la légende. */
export const COULEURS_STATUT: Record<StatutStock, number> = {
  RUPTURE: 0xd9453a,
  BAS: 0xf0922b,
  NOUVEAU: 0x3b82d6,
  OK: 0x3fae6a,
};

export const couleurCss = (s: StatutStock) => `#${COULEURS_STATUT[s].toString(16).padStart(6, "0")}`;

export const libelleStatut = (s: StatutStock) =>
  s === "RUPTURE" ? t("Rupture") : s === "BAS" ? t("Stock bas") : s === "NOUVEAU" ? t("Nouveau / promo") : t("Stock suffisant");

export const toneStatut = (s: StatutStock) => (s === "RUPTURE" ? "danger" : s === "BAS" ? "warning" : s === "NOUVEAU" ? "info" : "positive") as "danger" | "warning" | "info" | "positive";

/** Le plus urgent des statuts (null : aucun). */
export function pireStatut(statuts: Iterable<StatutStock>): StatutStock | null {
  let meilleur = -1;
  for (const s of statuts) {
    const i = ORDRE_STATUTS.indexOf(s);
    if (meilleur === -1 || i < meilleur) meilleur = i;
  }
  return meilleur === -1 ? null : ORDRE_STATUTS[meilleur];
}

export const statutDe = (a: ArticleRange): StatutStock => a.statut;

export const statutCase = (contenu: Emplacement[]) => pireStatut(contenu.map((e) => e.article.statut));
export const statutRack = (rack: Rack) => pireStatut(rack.emplacements.map((e) => e.article.statut));

export interface Compte {
  rupture: number;
  bas: number;
  nouveau: number;
  ok: number;
}

/** Nombre de cases occupées par statut (le pire statut des articles de la case). */
export function compterCases(data: EntrepotData): Record<StatutStock, number> {
  const c: Record<StatutStock, number> = { RUPTURE: 0, BAS: 0, NOUVEAU: 0, OK: 0 };
  for (const r of data.racks) {
    const parCase = new Map<string, Emplacement[]>();
    for (const e of r.emplacements) parCase.set(`${e.niveau}:${e.travee}`, [...(parCase.get(`${e.niveau}:${e.travee}`) ?? []), e]);
    for (const contenu of parCase.values()) {
      const s = statutCase(contenu);
      if (s) c[s]++;
    }
  }
  return c;
}

export interface PointAttention {
  rackId: string;
  rackNom: string;
  niveau: number;
  travee: number;
  article: ArticleRange;
}

/** Ce qui demande de l'attention : ruptures puis stocks bas, dans l'ordre du plan (une ligne par article et par case). */
export function pointsAttention(data: EntrepotData, max = 12): { total: number; points: PointAttention[] } {
  const tous: PointAttention[] = [];
  for (const r of data.racks) {
    for (const e of r.emplacements) {
      if (e.article.statut === "RUPTURE" || e.article.statut === "BAS") {
        tous.push({ rackId: r.id, rackNom: r.nom, niveau: e.niveau, travee: e.travee, article: e.article });
      }
    }
  }
  tous.sort((a, b) => ORDRE_STATUTS.indexOf(a.article.statut) - ORDRE_STATUTS.indexOf(b.article.statut));
  return { total: tous.length, points: tous.slice(0, max) };
}
