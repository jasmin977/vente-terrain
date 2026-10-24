// Calcul d'un ticket : promotions (mêmes règles que les BL du PC et des vendeurs, mais en prix TTC), remises,
// total et rendu monnaie.
import type { ArticleCaisse, LigneSaisie, LigneTicketEnvoi, Promotion, PromotionLigne, TicketEnCours } from "../types";
import { arrondir, jourLocal, ttcDepuisHT } from "./format";

const num = (v: number | string | null | undefined) => Number(v ?? 0) || 0;

export interface LigneCalculee {
  uid: string;
  articleId: string;
  designation: string;
  codeBarre: string | null;
  /** Pièces payées. */
  quantite: number;
  /** Prix TTC d'une pièce (prix promo compris). */
  prixUnitaire: number;
  /** Prix normal (barré quand la promo baisse le prix). */
  prixNormal: number;
  quantiteOfferte: number;
  /** Remise de la promotion (TTC). */
  remisePromo: number;
  /** Remise manuelle du caissier (TTC). */
  remise: number;
  montant: number;
  promotionId: string | null;
  promo: string | null;
  /** Ligne ajoutée par la promotion (article offert) : pas modifiable. */
  offerte: boolean;
}

export interface TicketCalcule {
  lignes: LigneCalculee[];
  /** Somme des lignes, avant la remise du ticket. */
  sousTotal: number;
  remise: number;
  total: number;
  nbArticles: number;
  economies: number;
}

function promotionDe(articleId: string, promos: Promotion[], jour: string): { p: Promotion; l: PromotionLigne } | null {
  for (const p of promos) {
    if (p.dateDebut > jour || p.dateFin < jour) continue;
    const l = p.lignes.find((x) => x.articleId === articleId);
    if (l) return { p, l };
  }
  return null;
}

/** Les lignes d'un même article sont regroupées pour la promotion (3 passages = 3 pièces pour un « 2 + 1 »). */
export function calculerTicket(ticket: TicketEnCours, articles: Map<string, ArticleCaisse>, promos: Promotion[], date = new Date()): TicketCalcule {
  const jour = jourLocal(date);
  const avecPromo = ticket.type === "VENTE";
  const lignes: LigneCalculee[] = ticket.lignes.map((l: LigneSaisie) => ({
    uid: l.uid,
    articleId: l.articleId,
    designation: l.designation,
    codeBarre: l.codeBarre ?? articles.get(l.articleId)?.codeBarre ?? null,
    quantite: l.quantite,
    prixUnitaire: l.prixUnitaire,
    prixNormal: l.prixUnitaire,
    quantiteOfferte: 0,
    remisePromo: 0,
    remise: l.remise,
    montant: 0,
    promotionId: null,
    promo: null,
    offerte: false,
  }));

  if (avecPromo) {
    // Quantité totale par article (les promotions de quantité portent sur l'ensemble du ticket).
    const parArticle = new Map<string, LigneCalculee[]>();
    for (const l of lignes) parArticle.set(l.articleId, [...(parArticle.get(l.articleId) ?? []), l]);
    const cadeaux: { articleId: string; quantite: number; p: Promotion }[] = [];

    for (const [articleId, groupe] of parArticle) {
      const trouve = promotionDe(articleId, promos, jour);
      const a = articles.get(articleId);
      if (!trouve || !a) continue;
      const { p, l: pl } = trouve;
      const q = groupe.reduce((s, x) => s + x.quantite, 0);
      const mode = p.type === "PRIX" ? "PRIX" : p.mode;
      const derniere = groupe[groupe.length - 1];
      const prix = derniere.prixUnitaire;
      if (mode === "PRIX" && num(pl.prixPromo) > 0) {
        const promo = ttcDepuisHT(num(pl.prixPromo), a.tva, a.fodec);
        for (const x of groupe) {
          x.prixUnitaire = promo;
          x.promotionId = p.id;
          x.promo = "Prix promo";
        }
        continue;
      }
      let offertes = 0;
      let remise = 0;
      let texte = "";
      if (mode === "UN_PLUS_UN") {
        offertes = q;
        texte = "1 + 1 gratuit";
      } else if (mode === "N_PLUS_UN" && pl.seuil) {
        offertes = Math.floor(q / pl.seuil);
        texte = `${pl.seuil} + 1 gratuit`;
      } else if (mode === "DEUXIEME_MOITIE") {
        remise = arrondir(Math.floor(q / 2) * prix * 0.5);
        texte = "2ᵉ à −50 %";
      } else if (mode === "PRIX_LOT" && pl.tailleLot && num(pl.prixLot) > 0) {
        const lots = Math.floor(q / pl.tailleLot);
        const prixDuLot = ttcDepuisHT(num(pl.prixLot), a.tva, a.fodec);
        remise = arrondir(Math.max(0, lots * (pl.tailleLot * prix - prixDuLot)));
        texte = `Lot de ${pl.tailleLot}`;
      } else if (mode === "CADEAU" && pl.articleOffertId && num(pl.quantiteOfferte) > 0) {
        cadeaux.push({ articleId: pl.articleOffertId, quantite: q * num(pl.quantiteOfferte), p });
        texte = "Article offert";
      }
      if (!texte) continue;
      const effet = mode === "CADEAU" || offertes > 0 || remise > 0;
      // Effet porté par la dernière ligne de l'article ; la promo reste signalée tant qu'elle n'est pas atteinte.
      derniere.quantiteOfferte = offertes;
      derniere.remisePromo = remise;
      for (const x of groupe) {
        x.promotionId = effet ? p.id : null;
        x.promo = effet ? texte : `${texte} (pas encore atteint)`;
      }
    }

    for (const c of cadeaux) {
      if (c.quantite <= 0) continue;
      const a = articles.get(c.articleId);
      lignes.push({
        uid: `offert-${c.articleId}`,
        articleId: c.articleId,
        designation: a?.designation ?? "Article offert",
        codeBarre: a?.codeBarre ?? null,
        quantite: 0,
        prixUnitaire: a?.prixTTC ?? 0,
        prixNormal: a?.prixTTC ?? 0,
        quantiteOfferte: c.quantite,
        remisePromo: 0,
        remise: 0,
        montant: 0,
        promotionId: c.p.id,
        promo: "Offert",
        offerte: true,
      });
    }
  }

  let economies = 0;
  for (const l of lignes) {
    l.montant = arrondir(Math.max(0, l.quantite * l.prixUnitaire - l.remisePromo - l.remise));
    economies += (l.prixNormal - l.prixUnitaire) * l.quantite + l.remisePromo + l.quantiteOfferte * l.prixNormal;
  }
  const sousTotal = arrondir(lignes.reduce((s, l) => s + l.montant, 0));
  const remise = Math.min(arrondir(ticket.remise), sousTotal);
  return {
    lignes,
    sousTotal,
    remise,
    total: arrondir(sousTotal - remise),
    nbArticles: arrondir(lignes.reduce((s, l) => s + l.quantite + l.quantiteOfferte, 0)),
    economies: arrondir(economies),
  };
}

/** Lignes envoyées au serveur : remise = promotion + caissier (montant de ligne = quantité × prix − remise). */
export const lignesEnvoi = (c: TicketCalcule): LigneTicketEnvoi[] =>
  c.lignes.map((l) => ({
    articleId: l.articleId,
    quantite: l.quantite,
    prixUnitaire: l.prixUnitaire,
    remise: arrondir(l.remisePromo + l.remise),
    quantiteOfferte: l.quantiteOfferte,
    promotionId: l.promotionId,
  }));

/** Index des codes-barres (principal et alternatifs) et des codes articles. */
export function indexCodes(articles: ArticleCaisse[]) {
  const m = new Map<string, ArticleCaisse>();
  for (const a of articles) {
    if (a.code) m.set(a.code.toUpperCase(), a);
    for (const c of a.codesBarres) m.set(c.codeBarre, a);
  }
  // Le code-barres principal l'emporte sur un code alternatif identique.
  for (const a of articles) if (a.codeBarre) m.set(a.codeBarre, a);
  return m;
}

/** Recherche par désignation (tous les mots, sans accents). */
export function rechercher(articles: ArticleCaisse[], texte: string, max = 40) {
  const sans = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const mots = sans(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  const res: ArticleCaisse[] = [];
  for (const a of articles) {
    const cible = sans(`${a.designation} ${a.marque ?? ""} ${a.code ?? ""} ${a.codeBarre ?? ""}`);
    if (mots.every((m) => cible.includes(m))) {
      res.push(a);
      if (res.length >= max) break;
    }
  }
  return res;
}
