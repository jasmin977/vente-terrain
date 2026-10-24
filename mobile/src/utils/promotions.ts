// Promotions : libellés, calcul des marges (écran des promotions) et application sur les lignes d'un BL de vente.
// L'application est la même sur le PC et dans l'application des vendeurs (hors ligne compris).
import type { ArticlePromo, LignePromotion, ModeLot, Promotion, StatutPromotion } from "../types/promotion";
import { arrondir, ttcDepuisHT } from "./tarifs";
import { t } from "../i18n";

export const LIBELLES_MODE: Record<ModeLot, { titre: string; exemple: string }> = {
  CADEAU: { titre: "Article offert", exemple: "1 article acheté = un autre article offert" },
  UN_PLUS_UN: { titre: "1 + 1 gratuit", exemple: "1 acheté = 1 offert" },
  DEUXIEME_MOITIE: { titre: "2ᵉ à −50 %", exemple: "la 2ᵉ pièce à moitié prix" },
  N_PLUS_UN: { titre: "N + 1 gratuit", exemple: "2 + 1, 3 + 1 : à partir de N pièces, 1 offerte" },
  PRIX_LOT: { titre: "Prix du lot", exemple: "lot de 10 yaourts à un prix" },
};

export const STATUTS_PROMO: Record<StatutPromotion, { texte: string; ton: "positive" | "info" | "neutral" }> = {
  EN_COURS: { texte: "En cours", ton: "positive" },
  A_VENIR: { texte: "À venir", ton: "info" },
  TERMINEE: { texte: "Terminée", ton: "neutral" },
};

export const libelleTypePromotion = (p: Pick<Promotion, "type" | "mode">) =>
  p.type === "PRIX" ? t("Prix promo") : p.mode ? t(LIBELLES_MODE[p.mode].titre) : t("Vente en lot");

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

/** Prix de vente TTC d'un article (FODEC compris), comme sur les BL. */
export const venteTTC = (a: ArticlePromo) => ttcDepuisHT(num(a.prixVente), num(a.tva), num(a.fodec));
/** Prix unitaire d'un BL (HT, FODEC compris) pour un prix de vente HT. */
const prixLigne = (ht: number, a: ArticlePromo) => arrondir(ht * (1 + num(a.fodec) / 100), 6);

/**
 * Ce que rapporte une pièce vendue en promotion, en HT (les deux côtés sans taxe, comme la marge de la fiche
 * article) : ce que la pièce rapporte en moyenne une fois les pièces offertes ou remisées comptées, moins ce
 * qu'elle a coûté. `cout` : prix d'achat de la pièce (avec l'article offert pour « article offert »).
 */
export function gainPromo(mode: Promotion["type"] | ModeLot, l: LignePromotion): { gain: number; cout: number } | undefined {
  const a = l.article;
  if (!a || a.prixAchat == null) return undefined;
  const achat = num(a.prixAchat);
  const vente = num(a.prixVente);
  let recette: number | undefined;
  let cout = achat;
  switch (mode) {
    case "PRIX":
      recette = l.prixPromo ?? undefined;
      break;
    case "UN_PLUS_UN":
      recette = vente / 2;
      break;
    case "DEUXIEME_MOITIE":
      recette = (vente * 1.5) / 2;
      break;
    case "N_PLUS_UN":
      recette = l.seuil ? (vente * l.seuil) / (l.seuil + 1) : undefined;
      break;
    case "PRIX_LOT":
      recette = l.tailleLot && l.prixLot ? l.prixLot / l.tailleLot : undefined;
      break;
    case "CADEAU":
      // La pièce vendue paie aussi le cadeau (au prix d'achat de l'article offert).
      recette = vente;
      cout = achat + (l.articleOffert ? num(l.articleOffert.prixAchat) * num(l.quantiteOfferte) : 0);
      break;
  }
  return recette === undefined ? undefined : { gain: arrondir(recette - cout, 3), cout };
}

/** Marge de la promotion sur le prix d'achat : gain d'une pièce ÷ son coût (HT). */
export function margePromo(mode: Promotion["type"] | ModeLot, l: LignePromotion): number | undefined {
  const g = gainPromo(mode, l);
  return g && g.cout > 0 ? arrondir((g.gain / g.cout) * 100, 2) : undefined;
}

/** Prix d'achat TTC (taxes comme sur le prix de vente) : le prix promo le plus bas sans perte. */
export const prixPlancherTTC = (a: ArticlePromo) => (a.prixAchat == null ? undefined : ttcDepuisHT(num(a.prixAchat), num(a.tva), num(a.fodec)));

/* ---------------------------------------------------------------- Application sur un BL */

export interface LigneVente {
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
}

export interface LigneVentePromo extends LigneVente {
  quantiteOfferte: number;
  remise: number;
  promotionId: string | null;
  /** Ce que la promotion fait sur la ligne, pour l'afficher (« PR-26/0003 · Prix promo », « 2 offertes »…). */
  promo?: { numero: string; texte: string };
}

const jourDe = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Promotion (et sa ligne) qui porte sur un article à cette date. */
export function promotionDe(articleId: string, promos: Promotion[], jour: string) {
  for (const p of promos) {
    if (p.dateDebut > jour || p.dateFin < jour) continue;
    const l = p.lignes.find((x) => x.articleId === articleId);
    if (l) return { promotion: p, ligne: l };
  }
  return null;
}

/**
 * Applique les promotions en cours aux lignes d'un BL (pièces payées saisies par le vendeur) :
 * prix promo, pièces offertes, remises de lot, et article offert ajouté (ou complété) à 0.
 */
export function appliquerPromotions(lignes: LigneVente[], promos: Promotion[], articles: Map<string, ArticlePromo>, date = new Date()): LigneVentePromo[] {
  const jour = jourDe(date);
  const res: LigneVentePromo[] = lignes.map((l) => ({ ...l, quantiteOfferte: 0, remise: 0, promotionId: null }));
  const cadeaux: { articleId: string; quantite: number; promotion: Promotion }[] = [];

  for (const r of res) {
    const trouve = promotionDe(r.articleId, promos, jour);
    const article = articles.get(r.articleId);
    if (!trouve || !article) continue;
    const { promotion: p, ligne: pl } = trouve;
    const q = r.quantite;
    const mode = p.type === "PRIX" ? "PRIX" : p.mode;
    let texte = "";
    if (mode === "PRIX" && pl.prixPromo) {
      r.prixUnitaire = prixLigne(pl.prixPromo, article);
      texte = t("Prix promo");
    } else if (mode === "UN_PLUS_UN") {
      r.quantiteOfferte = q;
      texte = t("1 + 1 : {n} offerte(s)", { n: q });
    } else if (mode === "N_PLUS_UN" && pl.seuil) {
      r.quantiteOfferte = Math.floor(q / pl.seuil);
      texte = t("{s} + 1 : {n} offerte(s)", { s: pl.seuil, n: r.quantiteOfferte });
    } else if (mode === "DEUXIEME_MOITIE") {
      r.remise = arrondir(Math.floor(q / 2) * r.prixUnitaire * 0.5, 3);
      texte = t("2ᵉ à −50 %");
    } else if (mode === "PRIX_LOT" && pl.tailleLot && pl.prixLot) {
      const lots = Math.floor(q / pl.tailleLot);
      const prixDuLot = prixLigne(pl.prixLot, article);
      r.remise = arrondir(Math.max(0, lots * (pl.tailleLot * r.prixUnitaire - prixDuLot)), 3);
      texte = t("Lot de {n} : {l} lot(s)", { n: pl.tailleLot, l: lots });
    } else if (mode === "CADEAU" && pl.articleOffertId && pl.quantiteOfferte) {
      cadeaux.push({ articleId: pl.articleOffertId, quantite: q * pl.quantiteOfferte, promotion: p });
      texte = t("Article offert");
    }
    if (!texte) continue;
    // Une promotion sans effet sur cette quantité (2 + 1 pour 1 pièce) reste signalée, sans être appliquée.
    const effet = mode === "PRIX" || mode === "CADEAU" || r.quantiteOfferte > 0 || r.remise > 0;
    r.promotionId = effet ? p.id : null;
    r.promo = { numero: p.numero, texte: effet ? texte : t("{t} (pas encore atteint)", { t: libelleTypePromotion(p) }) };
  }

  // Articles offerts : sur la ligne de l'article s'il est déjà au BL, sinon une ligne à 0 pièce payée.
  for (const c of cadeaux) {
    if (c.quantite <= 0) continue;
    const existant = res.find((r) => r.articleId === c.articleId);
    if (existant) {
      existant.quantiteOfferte += c.quantite;
      existant.promotionId ??= c.promotion.id;
      existant.promo ??= { numero: c.promotion.numero, texte: t("Offert") };
      continue;
    }
    const a = articles.get(c.articleId);
    res.push({
      articleId: c.articleId,
      quantite: 0,
      prixUnitaire: a ? prixLigne(num(a.prixVente), a) : 0,
      tauxTva: a ? num(a.tva) : 0,
      quantiteOfferte: c.quantite,
      remise: 0,
      promotionId: c.promotion.id,
      promo: { numero: c.promotion.numero, texte: t("Offert") },
    });
  }
  return res;
}

/** Total HT d'une ligne de BL (remise déduite). */
export const htLigne = (l: { quantite: number; prixUnitaire: number; remise?: number }) => Math.max(0, l.quantite * l.prixUnitaire - (l.remise ?? 0));
