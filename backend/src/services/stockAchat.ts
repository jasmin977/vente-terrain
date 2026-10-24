import type { Prisma } from "@prisma/client";
import { ajouterLot, synchroniserLots } from "../lib/lotsDepot";
import { noterPrix } from "../lib/historiquePrix";
import { arrondi } from "./achatService";

type Tx = Prisma.TransactionClient;

interface AchatStock {
  type: "BL" | "FACTURE" | "ENTREE";
  numero: string;
  fournisseurNom: string;
  lignes: {
    articleId: string | null;
    quantite: Prisma.Decimal | number;
    prixUnitaire: Prisma.Decimal | number;
    dateExpiration?: Date | null;
    /** Nouveau prix de vente HT choisi à la saisie. */
    prixVente?: number;
  }[];
}

const libelle = (a: Pick<AchatStock, "type" | "numero" | "fournisseurNom">) =>
  `${a.type === "BL" ? "BL fournisseur" : a.type === "FACTURE" ? "Facture fournisseur" : "B° Entrée"} ${a.numero} · ${a.fournisseurNom}`;

/** Quantités par article (un article sur plusieurs lignes est additionné) ; les lignes libres ne touchent pas au stock. */
function parArticle(lignes: AchatStock["lignes"]) {
  const m = new Map<string, { quantite: number; prix: number }>();
  for (const l of lignes) {
    if (!l.articleId) continue;
    const cur = m.get(l.articleId) ?? { quantite: 0, prix: Number(l.prixUnitaire) };
    cur.quantite = arrondi(cur.quantite + Number(l.quantite));
    cur.prix = Number(l.prixUnitaire);
    m.set(l.articleId, cur);
  }
  return m;
}

/**
 * Un BL, une facture ou un B° Entrée fait entrer sa marchandise au dépôt, directement (sans bon d'entrée du stock) :
 * stock, lots (avec leur date d'expiration), mouvement « entrée », nouveau prix d'achat et, s'il a été choisi à la
 * saisie, nouveau prix de vente. Les quantités sont des pièces.
 */
export async function entrerAchatAuDepot(tx: Tx, achat: AchatStock, adminId: string) {
  const reference = libelle(achat);
  // Une ligne = un lot (deux lignes du même article peuvent avoir des dates d'expiration différentes).
  for (const l of achat.lignes) {
    const quantite = Number(l.quantite);
    if (!l.articleId || quantite <= 0) continue;
    await tx.stockDepot.upsert({
      where: { articleId: l.articleId },
      create: { articleId: l.articleId, quantite },
      update: { quantite: { increment: quantite } },
    });
    await ajouterLot(tx, l.articleId, l.dateExpiration ?? null, quantite);
    await tx.mouvementDepot.create({ data: { articleId: l.articleId, sens: "ENTREE", quantite, reference } });
  }

  // Prix : une fois par article (dernière ligne de l'article).
  const prix = new Map<string, { achat: number; vente?: number }>();
  for (const l of achat.lignes) if (l.articleId) prix.set(l.articleId, { achat: Number(l.prixUnitaire), vente: l.prixVente });
  for (const [articleId, p] of prix) {
    const article = await tx.article.findUniqueOrThrow({ where: { id: articleId } });
    const achatChange = p.achat > 0 && Math.abs(p.achat - Number(article.prixAchat)) > 0.0000005;
    const venteChange = p.vente !== undefined && Math.abs(p.vente - Number(article.prixVente)) > 0.0000005;
    if (!achatChange && !venteChange) continue;
    const maj = await tx.article.update({
      where: { id: articleId },
      data: { ...(achatChange ? { prixAchat: p.achat } : {}), ...(venteChange ? { prixVente: p.vente } : {}) },
    });
    await noterPrix(tx, articleId, maj, article, "ENTREE", { adminId });
  }
}

/** Suppression d'un achat entré au dépôt : ses quantités sont retirées du stock (lots compris). */
export async function retirerAchatDuDepot(tx: Tx, achat: AchatStock) {
  const reference = `Suppression ${libelle(achat)}`;
  for (const [articleId, { quantite }] of parArticle(achat.lignes)) {
    if (quantite <= 0) continue;
    await tx.stockDepot.upsert({
      where: { articleId },
      create: { articleId, quantite: -quantite },
      update: { quantite: { decrement: quantite } },
    });
    await synchroniserLots(tx, articleId);
    await tx.mouvementDepot.create({ data: { articleId, sens: "AJUSTEMENT", quantite: -quantite, reference } });
  }
}
