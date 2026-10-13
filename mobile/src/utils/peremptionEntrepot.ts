import type { EntrepotData } from "../types/entrepot";
import type { Peremption } from "../types/lot";
import { dateFr, libelleJours } from "./peremption";
import { t } from "../i18n";

/**
 * Statut de péremption d'un article, affiché sur le plan 3D (mode « Péremption ») :
 *   EXPIRE  (rouge)   un lot est expiré : à retirer
 *   PROCHE  (orange)  un lot approche de sa date : à vérifier
 *   A_DATER (violet)  article périssable dont des pièces n'ont pas de date : à dater
 *   OK      (vert)    toutes les dates sont suivies et loin
 * Les articles non périssables (catégorie non suivie) restent gris.
 */
export type StatutPeremption = "EXPIRE" | "PROCHE" | "A_DATER" | "OK";

/** Du plus urgent au moins urgent. */
export const ORDRE_PEREMPTION: StatutPeremption[] = ["EXPIRE", "PROCHE", "A_DATER", "OK"];

export const COULEURS_PEREMPTION: Record<StatutPeremption, number> = {
  EXPIRE: 0xd9453a,
  PROCHE: 0xf0922b,
  A_DATER: 0x8a5bd6,
  OK: 0x3fae6a,
};
export const COULEUR_NON_SUIVI = 0xb9b5ad;

export const couleurPeremptionCss = (s: StatutPeremption) => `#${COULEURS_PEREMPTION[s].toString(16).padStart(6, "0")}`;

export const libellePeremption = (s: StatutPeremption) =>
  s === "EXPIRE" ? t("Expiré") : s === "PROCHE" ? t("À vérifier") : s === "A_DATER" ? t("Sans date") : t("Dates suivies");

export const tonePeremption = (s: StatutPeremption) => (s === "EXPIRE" ? "danger" : s === "PROCHE" ? "warning" : s === "A_DATER" ? "violet" : "positive") as "danger" | "warning" | "violet" | "positive";

export interface InfoPeremption {
  articleId: string;
  statut: StatutPeremption;
  /** Date d'expiration la plus proche (AAAA-MM-JJ), null : aucune date. */
  premiereDate: string | null;
  joursRestants: number | null;
  quantiteSansDate: number;
}

export interface Controle {
  articleId: string;
  designation: string;
  info: InfoPeremption;
  rackId: string;
  rackNom: string;
  niveau: number;
  travee: number;
}

export interface AnalysePeremption {
  parArticle: Map<string, InfoPeremption>;
  /** Nombre de cases par statut (le pire statut des articles de la case). */
  cases: Record<StatutPeremption, number>;
  /** Couleur de chaque article suivi ; `filtre` : seul ce statut reste en couleur, les autres passent en gris. */
  couleursArticles: (filtre: StatutPeremption | null) => Map<string, number>;
  couleursRacks: (filtre: StatutPeremption | null) => Map<string, number>;
  /** Ce qui demande un contrôle, du plus urgent au moins urgent. */
  aControler: Controle[];
  resume: Peremption["resume"];
}

const rang = (s: StatutPeremption) => ORDRE_PEREMPTION.indexOf(s);
const pire = (a: StatutPeremption, b: StatutPeremption) => (rang(a) <= rang(b) ? a : b);

export function analyserPeremption(data: EntrepotData, per: Peremption): AnalysePeremption {
  const parArticle = new Map<string, InfoPeremption>();

  for (const l of per.lots) {
    const cur = parArticle.get(l.articleId);
    const statut: StatutPeremption = l.statut === "EXPIRE" ? "EXPIRE" : l.statut === "PROCHE" ? "PROCHE" : "OK";
    if (!cur) {
      parArticle.set(l.articleId, { articleId: l.articleId, statut, premiereDate: l.dateExpiration, joursRestants: l.joursRestants, quantiteSansDate: 0 });
    } else {
      cur.statut = pire(cur.statut, statut);
      if (cur.joursRestants === null || l.joursRestants < cur.joursRestants) {
        cur.joursRestants = l.joursRestants;
        cur.premiereDate = l.dateExpiration;
      }
    }
  }
  for (const a of per.aDater) {
    const cur = parArticle.get(a.articleId);
    if (!cur) parArticle.set(a.articleId, { articleId: a.articleId, statut: "A_DATER", premiereDate: null, joursRestants: null, quantiteSansDate: a.quantiteSansDate });
    else {
      cur.statut = pire(cur.statut, "A_DATER");
      cur.quantiteSansDate = a.quantiteSansDate;
    }
  }

  const cases: Record<StatutPeremption, number> = { EXPIRE: 0, PROCHE: 0, A_DATER: 0, OK: 0 };
  const aControler: Controle[] = [];
  const dejaListes = new Set<string>();
  for (const r of data.racks) {
    const parCase = new Map<string, StatutPeremption>();
    for (const e of r.emplacements) {
      const info = parArticle.get(e.article.id);
      if (!info) continue;
      const cle = `${e.niveau}:${e.travee}`;
      parCase.set(cle, parCase.has(cle) ? pire(parCase.get(cle)!, info.statut) : info.statut);
      if (info.statut !== "OK" && !dejaListes.has(e.article.id)) {
        dejaListes.add(e.article.id);
        aControler.push({ articleId: e.article.id, designation: e.article.designation, info, rackId: r.id, rackNom: r.nom, niveau: e.niveau, travee: e.travee });
      }
    }
    for (const s of parCase.values()) cases[s]++;
  }
  aControler.sort((a, b) => rang(a.info.statut) - rang(b.info.statut) || (a.info.joursRestants ?? 9999) - (b.info.joursRestants ?? 9999));

  const couleursArticles = (filtre: StatutPeremption | null) => {
    const m = new Map<string, number>();
    for (const info of parArticle.values()) m.set(info.articleId, filtre === null || filtre === info.statut ? COULEURS_PEREMPTION[info.statut] : COULEUR_NON_SUIVI);
    return m;
  };
  const couleursRacks = (filtre: StatutPeremption | null) => {
    const m = new Map<string, number>();
    for (const r of data.racks) {
      let p: StatutPeremption | null = null;
      for (const e of r.emplacements) {
        const info = parArticle.get(e.article.id);
        if (info) p = p === null ? info.statut : pire(p, info.statut);
      }
      m.set(r.id, p && (filtre === null || filtre === p) ? COULEURS_PEREMPTION[p] : COULEUR_NON_SUIVI);
    }
    return m;
  };

  return { parArticle, cases, couleursArticles, couleursRacks, aControler, resume: per.resume };
}

/** Mention courte de la date à vérifier : « Expire le 12 oct. 2026 », « Expiré depuis 3 j », « Sans date (40 pièces) ». */
export function detailPeremption(info: InfoPeremption): string {
  if (info.statut === "A_DATER" || (info.premiereDate === null && info.quantiteSansDate > 0)) {
    return t("Sans date ({n} pièces)", { n: info.quantiteSansDate });
  }
  if (info.premiereDate === null || info.joursRestants === null) return "";
  return `${t("Expire le {d}", { d: dateFr(info.premiereDate) })} · ${libelleJours(info.joursRestants)}`;
}
