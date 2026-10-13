import type { ArticleRange, EntrepotData } from "../types/entrepot";
import { t } from "../i18n";

/** Ventes d'un article sur la période (backend GET /entrepot/ventes). */
export interface VentesArticle {
  articleId: string;
  quantite: number;
  caHT: number;
  caTTC: number;
  /** Marge brute HT ; null si l'article n'a pas de prix d'achat. */
  margeHT: number | null;
}

export interface VentesEntrepot {
  jours: number;
  debut: string;
  fin: string;
  articles: VentesArticle[];
  totaux: { quantite: number; caHT: number; caTTC: number; margeHT: number };
}

/** Ce que la carte de chaleur colore : chiffre d'affaires, marge, ou argent immobilisé en surstock. */
export type Metrique = "ca" | "marge" | "surstock";

/** Au-delà de ce nombre de jours de ventes en stock, le surplus est du surstock. */
export const COUVERTURE_CIBLE_JOURS = 90;

/** Intitulé de la métrique affichée sur la carte de chaleur. */
export const libelleMetrique = (m: Metrique) => (m === "ca" ? t("Chiffre d'affaires TTC") : m === "marge" ? t("Marge brute HT") : t("Surstock (valeur d'achat)"));

export const cleCase = (rackId: string, niveau: number, travee: number) => `${rackId}:${niveau}:${travee}`;

/** Un article dans une case, avec sa part des ventes et du stock (répartie selon les quantités rangées). */
export interface LigneCase {
  article: ArticleRange;
  quantitePlacee: number;
  ca: number;
  marge: number;
  qte: number;
  /** Jours de ventes que représente le stock de l'article (null : aucune vente sur la période). */
  couverture: number | null;
  excedentValeur: number;
}

export interface Stats {
  ca: number;
  marge: number;
  qte: number;
  /** Valeur d'achat du stock au-delà de COUVERTURE_CIBLE_JOURS de ventes. */
  surstock: number;
  nbCases: number;
}

const vide = (): Stats => ({ ca: 0, marge: 0, qte: 0, surstock: 0, nbCases: 0 });

export interface Classement {
  id: string;
  label: string;
  stats: Stats;
  /** Pour les produits : stock et couverture. */
  sub?: string;
}

export interface Reco {
  articleId: string;
  designation: string;
  /** Chiffre d'affaires TTC de la période. */
  ca: number;
  /** Valeur d'achat du surplus de stock. */
  surstock: number;
  nbCases: number;
  couverture: number | null;
  /** Première case où il est rangé (pour y amener la caméra). */
  rackId: string;
  niveau: number;
  travee: number;
}

export interface AnalyseVentes {
  jours: number;
  totaux: VentesEntrepot["totaux"];
  parCase: Map<string, { stats: Stats; lignes: LigneCase[] }>;
  parRack: Map<string, Stats>;
  parAllee: Classement[];
  parCategorie: Classement[];
  parProduit: Classement[];
  /** Valeur normalisée 0..1 de chaque case et étagère pour la métrique choisie. */
  chaleur: (m: Metrique) => { cases: Map<string, number>; racks: Map<string, number>; max: number };
  /** Produits à vendre plus : forte rotation sur peu de place. */
  aValoriser: Reco[];
  /** Produits en surstock : stock élevé, ventes faibles. */
  surstockProduits: Reco[];
  /** Étagères qui coûtent de la place sans vendre. */
  sectionsFaibles: { rackId: string; nom: string; caParCase: number; surstock: number }[];
}

const mediane = (valeurs: number[]) => {
  if (valeurs.length === 0) return 0;
  const t = [...valeurs].sort((a, b) => a - b);
  const m = Math.floor(t.length / 2);
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
};

const ajouter = (a: Stats, b: Partial<Stats>) => {
  a.ca += b.ca ?? 0;
  a.marge += b.marge ?? 0;
  a.qte += b.qte ?? 0;
  a.surstock += b.surstock ?? 0;
  a.nbCases += b.nbCases ?? 0;
};

/**
 * Croise le plan du dépôt (où est quoi) avec les ventes de la période : les ventes et le stock d'un article se
 * répartissent entre les cases où il est rangé, au prorata des quantités rangées.
 */
export function analyserVentes(data: EntrepotData, ventes: VentesEntrepot): AnalyseVentes {
  const jours = Math.max(1, ventes.jours);
  const venteDe = new Map(ventes.articles.map((v) => [v.articleId, v]));

  // Quantité rangée par article (pour répartir entre ses cases) et nombre de cases qu'il occupe.
  const rangeTotal = new Map<string, number>();
  const casesArticle = new Map<string, Set<string>>();
  for (const r of data.racks) {
    for (const e of r.emplacements) {
      rangeTotal.set(e.article.id, (rangeTotal.get(e.article.id) ?? 0) + e.quantite);
      const s = casesArticle.get(e.article.id) ?? new Set<string>();
      s.add(cleCase(r.id, e.niveau, e.travee));
      casesArticle.set(e.article.id, s);
    }
  }

  const parCase = new Map<string, { stats: Stats; lignes: LigneCase[] }>();
  const parRack = new Map<string, Stats>();
  const alleeStats = new Map<string, Stats>();
  const categorieStats = new Map<string, { label: string; stats: Stats; cases: Set<string> }>();
  const produitStats = new Map<string, Classement & { cases: Set<string> }>();
  const couvertureArticle = new Map<string, number | null>();
  const alleeCases = new Map<string, Set<string>>();

  for (const r of data.racks) {
    const rs = vide();
    for (const e of r.emplacements) {
      const a = e.article;
      const v = venteDe.get(a.id);
      const total = rangeTotal.get(a.id) || 1;
      const part = e.quantite / total;
      const ventesJour = (v?.quantite ?? 0) / jours;
      const cible = COUVERTURE_CIBLE_JOURS * ventesJour;
      const excedentPieces = Math.max(0, a.stock - cible);
      const valeurUnite = a.prixAchat > 0 ? a.prixAchat : a.prixTTC;
      const ligne: LigneCase = {
        article: a,
        quantitePlacee: e.quantite,
        ca: (v?.caTTC ?? 0) * part,
        marge: (v?.margeHT ?? 0) * part,
        qte: (v?.quantite ?? 0) * part,
        couverture: ventesJour > 0 ? a.stock / ventesJour : null,
        excedentValeur: excedentPieces * valeurUnite * part,
      };
      const cle = cleCase(r.id, e.niveau, e.travee);
      const c = parCase.get(cle) ?? { stats: vide(), lignes: [] };
      c.lignes.push(ligne);
      parCase.set(cle, c);
      ajouter(c.stats, { ca: ligne.ca, marge: ligne.marge, qte: ligne.qte, surstock: ligne.excedentValeur });
      ajouter(rs, { ca: ligne.ca, marge: ligne.marge, qte: ligne.qte, surstock: ligne.excedentValeur });

      const al = alleeStats.get(r.allee) ?? vide();
      ajouter(al, { ca: ligne.ca, marge: ligne.marge, qte: ligne.qte, surstock: ligne.excedentValeur });
      alleeStats.set(r.allee, al);
      alleeCases.set(r.allee, (alleeCases.get(r.allee) ?? new Set()).add(cle));

      const cat = a.categorie?.nom ?? "—";
      const cs = categorieStats.get(cat) ?? { label: cat, stats: vide(), cases: new Set<string>() };
      ajouter(cs.stats, { ca: ligne.ca, marge: ligne.marge, qte: ligne.qte, surstock: ligne.excedentValeur });
      cs.cases.add(cle);
      categorieStats.set(cat, cs);

      const ps = produitStats.get(a.id) ?? { id: a.id, label: a.designation, stats: vide(), cases: new Set<string>() };
      ajouter(ps.stats, { ca: ligne.ca, marge: ligne.marge, qte: ligne.qte, surstock: ligne.excedentValeur });
      ps.cases.add(cle);
      produitStats.set(a.id, ps);
      couvertureArticle.set(a.id, ligne.couverture);
    }
    rs.nbCases = new Set(r.emplacements.map((e) => `${e.niveau}:${e.travee}`)).size;
    parRack.set(r.id, rs);
  }
  for (const c of parCase.values()) c.stats.nbCases = 1;
  for (const [allee, s] of alleeStats) s.nbCases = alleeCases.get(allee)?.size ?? 0;
  for (const c of categorieStats.values()) c.stats.nbCases = c.cases.size;
  for (const p of produitStats.values()) p.stats.nbCases = p.cases.size;

  const tri = (a: Classement, b: Classement) => b.stats.ca - a.stats.ca || b.stats.surstock - a.stats.surstock;
  const parAllee = [...alleeStats.entries()].map(([id, stats]) => ({ id, label: id, stats })).sort(tri);
  const parCategorie = [...categorieStats.values()].map((c) => ({ id: c.label, label: c.label, stats: c.stats })).sort(tri);
  const parProduit = [...produitStats.values()].map((p) => ({ id: p.id, label: p.label, stats: p.stats })).sort(tri);

  // Recommandations
  const premiereCase = (articleId: string) => {
    for (const r of data.racks) for (const e of r.emplacements) if (e.article.id === articleId) return { rackId: r.id, niveau: e.niveau, travee: e.travee };
    return { rackId: data.racks[0]?.id ?? "", niveau: 0, travee: 0 };
  };
  const densites = parProduit.filter((p) => p.stats.ca > 0).map((p) => p.stats.ca / Math.max(1, p.stats.nbCases));
  const seuilDensite = mediane(densites) * 1.5;
  const reco = (p: Classement): Reco => ({
    articleId: p.id,
    designation: p.label,
    ca: p.stats.ca,
    surstock: p.stats.surstock,
    nbCases: p.stats.nbCases,
    couverture: couvertureArticle.get(p.id) ?? null,
    ...premiereCase(p.id),
  });
  // À valoriser : vend beaucoup par case occupée (au moins 1,5 × la médiane) et s'épuise vite (moins de 45 jours).
  const aValoriser: Reco[] = parProduit
    .filter((p) => p.stats.ca > 0 && p.stats.ca / Math.max(1, p.stats.nbCases) >= seuilDensite && (couvertureArticle.get(p.id) ?? Infinity) < 45)
    .sort((a, b) => b.stats.ca / Math.max(1, b.stats.nbCases) - a.stats.ca / Math.max(1, a.stats.nbCases))
    .slice(0, 6)
    .map(reco);
  const surstockProduits: Reco[] = parProduit
    .filter((p) => p.stats.surstock > 0)
    .sort((a, b) => b.stats.surstock - a.stats.surstock)
    .slice(0, 6)
    .map(reco);
  const rendementRacks = [...parRack.values()].filter((s) => s.nbCases > 0).map((s) => s.ca / s.nbCases);
  const seuilFaible = mediane(rendementRacks) * 0.4;
  const valeurMediane = mediane([...parRack.values()].map((s) => s.surstock));
  const sectionsFaibles = data.racks
    .map((r) => ({ r, s: parRack.get(r.id)! }))
    .filter(({ s }) => s.nbCases > 0 && s.ca / s.nbCases <= seuilFaible && s.surstock >= valeurMediane && s.surstock > 0)
    .sort((a, b) => b.s.surstock - a.s.surstock)
    .slice(0, 4)
    .map(({ r, s }) => ({ rackId: r.id, nom: r.nom, caParCase: s.ca / Math.max(1, s.nbCases), surstock: s.surstock }));

  const chaleur = (m: Metrique) => {
    const valeur = (s: Stats) => (m === "ca" ? s.ca : m === "marge" ? s.marge : s.surstock);
    const cases = new Map<string, number>();
    const racks = new Map<string, number>();
    let max = 0;
    for (const c of parCase.values()) max = Math.max(max, valeur(c.stats));
    let maxRack = 0;
    for (const s of parRack.values()) maxRack = Math.max(maxRack, valeur(s) / Math.max(1, s.nbCases));
    // Échelle racine : les petites ventes restent visibles face aux meilleures cases.
    for (const [k, c] of parCase) cases.set(k, max > 0 ? Math.sqrt(Math.max(0, valeur(c.stats)) / max) : 0);
    for (const [k, s] of parRack) racks.set(k, maxRack > 0 ? Math.sqrt(Math.max(0, valeur(s) / Math.max(1, s.nbCases)) / maxRack) : 0);
    return { cases, racks, max };
  };

  return { jours, totaux: ventes.totaux, parCase, parRack, parAllee, parCategorie, parProduit, chaleur, aValoriser, surstockProduits, sectionsFaibles };
}

/** Dégradé de la carte de chaleur, du froid (peu) au chaud (beaucoup) : bleu, turquoise, jaune, orange, rouge. */
const ARRETS: Array<[number, number]> = [
  [0, 0x2d4f9e],
  [0.25, 0x3fb0c0],
  [0.5, 0xf2d04b],
  [0.75, 0xf08a24],
  [1, 0xd12f2f],
];

export function couleurChaleur(v: number): number {
  const x = Math.max(0, Math.min(1, v));
  for (let i = 1; i < ARRETS.length; i++) {
    if (x <= ARRETS[i][0]) {
      const [a, ca] = ARRETS[i - 1];
      const [b, cb] = ARRETS[i];
      const t = (x - a) / (b - a);
      const mix = (s: number) => Math.round(((ca >> s) & 255) * (1 - t) + ((cb >> s) & 255) * t);
      return (mix(16) << 16) | (mix(8) << 8) | mix(0);
    }
  }
  return ARRETS[ARRETS.length - 1][1];
}

export const couleurChaleurCss = (v: number) => `#${couleurChaleur(v).toString(16).padStart(6, "0")}`;

/** CSS du dégradé de la légende. */
export const DEGRADE_CHALEUR = `linear-gradient(90deg, ${ARRETS.map(([p, c]) => `#${c.toString(16).padStart(6, "0")} ${p * 100}%`).join(", ")})`;
