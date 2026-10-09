import { Router, type Response } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { ciblesDeLaSociete, requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { plageDates } from "../utils/plage";

// Historique des mouvements de stock saisis par l'admin, avec suppression.
//
// Chargements / retours camion et entrées dépôt peuvent être supprimés : le
// stock est rétabli (mouvements AJUSTEMENT tracés) et le document reste dans
// l'historique, marqué supprimé (deletedAt).
export const stockHistoriqueRouter = Router();
stockHistoriqueRouter.use(requireAuth, requireAdmin, requireSociete, ciblesDeLaSociete);

class RefusSuppression extends Error {}

function serverError(res: Response, err: unknown) {
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

function repondreErreur(res: Response, err: unknown) {
  if (err instanceof RefusSuppression) return res.status(409).json({ error: err.message });
  return serverError(res, err);
}

const dateCourte = (d: Date) =>
  d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Verification = { possible: boolean; raison?: string; avertissement?: string };

/** Quantités cumulées par article (un article peut apparaître sur plusieurs lignes). */
function parArticle(lignes: { articleId: string; pieces: number }[]) {
  const m = new Map<string, number>();
  for (const l of lignes) m.set(l.articleId, (m.get(l.articleId) ?? 0) + l.pieces);
  return m;
}

/** Articles pour lesquels le dépôt n'a pas la quantité à retirer. */
async function manquesDepot(tx: Prisma.TransactionClient, besoins: Map<string, number>) {
  const manques: string[] = [];
  for (const [articleId, pieces] of besoins) {
    const depot = await tx.stockDepot.findUnique({ where: { articleId } });
    const dispo = Number(depot?.quantite ?? 0);
    if (dispo < pieces) {
      const article = await tx.article.findUnique({ where: { id: articleId } });
      manques.push(`${article?.designation ?? articleId} (dépôt : ${dispo}, à retirer : ${pieces})`);
    }
  }
  return manques;
}

// ================================================================ Entrées dépôt

const entreeInclude = {
  admin: { select: { id: true, nom: true, code: true } },
  lignes: { include: { article: true } },
} satisfies Prisma.EntreeDepotInclude;

const totalPieces = (lignes: { quantite: Prisma.Decimal | number }[]) =>
  lignes.reduce((s, l) => s + Number(l.quantite), 0);

async function verifierSuppressionEntree(
  tx: Prisma.TransactionClient,
  entree: { deletedAt: Date | null; lignes: { articleId: string; quantite: Prisma.Decimal }[] }
): Promise<Verification> {
  if (entree.deletedAt) return { possible: false, raison: "Cette entrée est déjà supprimée." };
  const manques = await manquesDepot(
    tx,
    parArticle(entree.lignes.map((l) => ({ articleId: l.articleId, pieces: Number(l.quantite) })))
  );
  // L'admin peut toujours supprimer le bon : le dépôt peut alors devenir négatif.
  if (manques.length) {
    return {
      possible: true,
      avertissement: `Le dépôt n'a plus toutes ces quantités (déjà chargées dans un camion ?) : il deviendra négatif pour ${manques.join(" ; ")}.`,
    };
  }
  return { possible: true };
}

stockHistoriqueRouter.get("/depot/entrees", async (req, res) => {
  try {
    const date = plageDates(req.query);
    const entrees = await prisma.entreeDepot.findMany({
      where: { societeId: req.societeId, ...(date ? { date } : {}) },
      include: { admin: entreeInclude.admin, lignes: { select: { quantite: true } } },
      orderBy: { date: "desc" },
      take: 200,
    });
    res.json(
      entrees.map(({ lignes, ...e }) => ({ ...e, nbLignes: lignes.length, totalPieces: totalPieces(lignes) }))
    );
  } catch (err) {
    serverError(res, err);
  }
});

stockHistoriqueRouter.get("/depot/entrees/:id", async (req, res) => {
  try {
    const entree = await prisma.entreeDepot.findFirst({ where: { id: req.params.id, societeId: req.societeId }, include: entreeInclude });
    if (!entree) return res.status(404).json({ error: "Entrée introuvable" });
    const suppression = await verifierSuppressionEntree(prisma, entree);
    res.json({ ...entree, nbLignes: entree.lignes.length, totalPieces: totalPieces(entree.lignes), suppression });
  } catch (err) {
    serverError(res, err);
  }
});

// Supprimer une entrée retire du dépôt les quantités reçues.
stockHistoriqueRouter.delete("/depot/entrees/:id", async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const entree = await tx.entreeDepot.findFirst({ where: { id: req.params.id, societeId: req.societeId }, include: { lignes: true } });
      if (!entree) throw new RefusSuppression("Entrée introuvable");
      const verif = await verifierSuppressionEntree(tx, entree);
      if (!verif.possible) throw new RefusSuppression(verif.raison!);

      const reference = `Suppression entrée ${entree.reference ?? dateCourte(entree.date)}`;
      for (const l of entree.lignes) {
        await tx.stockDepot.upsert({
          where: { articleId: l.articleId },
          create: { articleId: l.articleId, quantite: -Number(l.quantite) },
          update: { quantite: { decrement: l.quantite } },
        });
        await tx.mouvementDepot.create({
          data: {
            articleId: l.articleId,
            sens: "AJUSTEMENT",
            quantite: -Number(l.quantite),
            reference,
            entreeId: entree.id,
          },
        });
      }
      await tx.entreeDepot.update({ where: { id: entree.id }, data: { deletedAt: new Date() } });
    });
    res.status(204).send();
  } catch (err) {
    repondreErreur(res, err);
  }
});

// ================================================================ Chargements / retours

const chargementInclude = {
  // voiture / matricule : imprimés sur le bon de sortie.
  vendeur: { select: { id: true, nom: true, code: true, voiture: true, matriculeVoiture: true } },
  lignes: { include: { article: true } },
} satisfies Prisma.ChargementCamionInclude;

// Les lignes antérieures à quantiteUnites n'ont que quantiteColis : on
// reconvertit en pièces avec le colisage de l'article.
const piecesLigne = (l: {
  quantiteUnites: Prisma.Decimal | null;
  quantiteColis: Prisma.Decimal;
  article: { colisage: number };
}) => (l.quantiteUnites !== null ? Number(l.quantiteUnites) : Number(l.quantiteColis) * l.article.colisage);

async function verifierSuppressionChargement(
  tx: Prisma.TransactionClient,
  ch: Prisma.ChargementCamionGetPayload<{ include: typeof chargementInclude }>
): Promise<Verification> {
  if (ch.deletedAt) return { possible: false, raison: "Ce mouvement est déjà supprimé." };

  // L'admin peut toujours supprimer un bon de chargement ou de retour : le stock
  // est rétabli en sens inverse. Les cas délicats sont signalés avant confirmation.
  const avertissements: string[] = [];

  // Un inventaire validé depuis a remplacé le stock camion par un comptage réel.
  const inventaire = await tx.inventaire.findFirst({
    where: { vendeurId: ch.vendeurId, statut: "VALIDE", dateValidation: { gt: ch.date } },
    orderBy: { dateValidation: "desc" },
  });
  if (inventaire) {
    avertissements.push(
      `Un inventaire de ce camion a été validé depuis (le ${dateCourte(inventaire.dateValidation!)}) : le stock camion recompté sera modifié.`
    );
  }

  const pieces = parArticle(ch.lignes.map((l) => ({ articleId: l.articleId, pieces: piecesLigne(l) })));

  if (ch.sens === "RETOUR") {
    // Supprimer un retour renvoie la marchandise du dépôt vers le camion.
    const manques = await manquesDepot(tx, pieces);
    if (manques.length) avertissements.push(`Le dépôt deviendra négatif pour ${manques.join(" ; ")}.`);
    return avertissements.length ? { possible: true, avertissement: avertissements.join(" ") } : { possible: true };
  }

  // Supprimer un chargement remet la marchandise au dépôt et la retire du
  // camion, qui peut devenir négatif si une partie a déjà été vendue.
  const negatifs: string[] = [];
  for (const [articleId, p] of pieces) {
    const stock = await tx.stockCamion.findUnique({
      where: { vendeurId_articleId: { vendeurId: ch.vendeurId, articleId } },
    });
    const qte = Number(stock?.quantite ?? 0);
    if (qte < p) {
      const nom = ch.lignes.find((l) => l.articleId === articleId)?.article.designation ?? articleId;
      negatifs.push(`${nom} (camion : ${qte} → ${qte - p})`);
    }
  }
  if (negatifs.length) {
    avertissements.push(`Une partie a déjà été vendue : le stock camion deviendra négatif pour ${negatifs.join(" ; ")}.`);
  }
  return avertissements.length ? { possible: true, avertissement: avertissements.join(" ") } : { possible: true };
}

stockHistoriqueRouter.get("/chargements", async (req, res) => {
  try {
    const vendeurId = req.query.vendeurId as string | undefined;
    const date = plageDates(req.query);
    const chargements = await prisma.chargementCamion.findMany({
      where: { vendeur: { societeId: req.societeId }, ...(vendeurId ? { vendeurId } : {}), ...(date ? { date } : {}) },
      include: { vendeur: chargementInclude.vendeur, lignes: { include: { article: { select: { colisage: true } } } } },
      orderBy: { date: "desc" },
      take: 200,
    });
    res.json(
      chargements.map(({ lignes, ...c }) => ({
        ...c,
        nbLignes: lignes.length,
        totalPieces: lignes.reduce((s, l) => s + piecesLigne(l), 0),
      }))
    );
  } catch (err) {
    serverError(res, err);
  }
});

stockHistoriqueRouter.get("/chargements/:id", async (req, res) => {
  try {
    const ch = await prisma.chargementCamion.findFirst({
      where: { id: req.params.id, vendeur: { societeId: req.societeId } },
      include: chargementInclude,
    });
    if (!ch) return res.status(404).json({ error: "Mouvement introuvable" });
    const suppression = await verifierSuppressionChargement(prisma, ch);
    const lignes = ch.lignes.map((l) => ({ ...l, pieces: piecesLigne(l) }));
    res.json({
      ...ch,
      lignes,
      nbLignes: lignes.length,
      totalPieces: lignes.reduce((s, l) => s + l.pieces, 0),
      suppression,
    });
  } catch (err) {
    serverError(res, err);
  }
});

stockHistoriqueRouter.delete("/chargements/:id", async (req, res) => {
  try {
    await prisma.$transaction(async (tx) => {
      const ch = await tx.chargementCamion.findFirst({
        where: { id: req.params.id, vendeur: { societeId: req.societeId } },
        include: chargementInclude,
      });
      if (!ch) throw new RefusSuppression("Mouvement introuvable");
      const verif = await verifierSuppressionChargement(tx, ch);
      if (!verif.possible) throw new RefusSuppression(verif.raison!);

      // Sens inverse du mouvement d'origine : +1 = vers le dépôt.
      const versDepot = ch.sens === "CHARGEMENT" ? 1 : -1;
      const reference = `Suppression ${ch.sens === "CHARGEMENT" ? "chargement" : "retour"} du ${dateCourte(ch.date)}`;
      for (const l of ch.lignes) {
        const pieces = piecesLigne(l);
        await tx.stockDepot.upsert({
          where: { articleId: l.articleId },
          create: { articleId: l.articleId, quantite: versDepot * pieces },
          update: { quantite: { increment: versDepot * pieces } },
        });
        await tx.stockCamion.upsert({
          where: { vendeurId_articleId: { vendeurId: ch.vendeurId, articleId: l.articleId } },
          create: { vendeurId: ch.vendeurId, articleId: l.articleId, quantite: -versDepot * pieces },
          update: { quantite: { increment: -versDepot * pieces } },
        });
        await tx.mouvementStock.create({
          data: {
            vendeurId: ch.vendeurId,
            articleId: l.articleId,
            sens: "AJUSTEMENT",
            quantite: -versDepot * pieces,
            reference,
          },
        });
        await tx.mouvementDepot.create({
          data: {
            articleId: l.articleId,
            sens: "AJUSTEMENT",
            quantite: versDepot * pieces,
            vendeurId: ch.vendeurId,
            reference,
          },
        });
      }
      await tx.chargementCamion.update({ where: { id: ch.id }, data: { deletedAt: new Date() } });
    });
    res.status(204).send();
  } catch (err) {
    repondreErreur(res, err);
  }
});

// ================================================================ Ventes par article
//
// Quantités vendues par article sur une période (toutes les factures validées,
// tous vendeurs) : alimente le classement « plus / moins vendus » du dépôt.
stockHistoriqueRouter.get("/ventes-par-article", async (req, res) => {
  try {
    const jours = Math.min(Math.max(Number(req.query.jours) || 30, 1), 365);
    const depuis = new Date();
    depuis.setHours(0, 0, 0, 0);
    depuis.setDate(depuis.getDate() - (jours - 1));

    const ventes = await prisma.ligneFacture.groupBy({
      by: ["articleId"],
      where: { facture: { statut: "VALIDEE", deletedAt: null, date: { gte: depuis }, client: { societeId: req.societeId } } },
      _sum: { quantite: true, montantHT: true },
    });
    res.json({
      jours,
      depuis,
      ventes: ventes.map((v) => ({
        articleId: v.articleId,
        quantite: Number(v._sum.quantite ?? 0),
        montantHT: Number(v._sum.montantHT ?? 0),
      })),
    });
  } catch (err) {
    serverError(res, err);
  }
});
