import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ORDRE_CATALOGUE } from "../lib/ordreArticles";
import { ciblesDeLaSociete, requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { plageDates } from "../utils/plage";
import { ajouterLot, dateEnTexte, dateExpirationSchema, joursRestants, synchroniserLots } from "../lib/lotsDepot";
import { comparerOrdreCatalogue } from "../lib/ordreArticles";
import { noterPrix } from "../lib/historiquePrix";
import { htDepuisMarge } from "../lib/tarifs";

export const stockRouter = Router();
// Tout le module stock est réservé à l'admin : le vendeur ne doit pas connaître
// le stock théorique de son camion (contrôle par inventaire).
stockRouter.use(requireAuth, requireAdmin, requireSociete, ciblesDeLaSociete);

// Une quantité peut être saisie en colis (convertie via le colisage de
// l'article) ou directement en unités.
const ligneQuantiteSchema = z.object({
  articleId: z.string().uuid(),
  quantite: z.number().positive(),
  unite: z.enum(["COLIS", "UNITE"]).default("COLIS"),
});

const enUnites = (quantite: number, unite: "COLIS" | "UNITE", colisage: number) =>
  unite === "COLIS" ? quantite * colisage : quantite;

class StockError extends Error {}

// Express 4 ne capture pas les erreurs des handlers async : on répond nous-mêmes.
function serverError(res: import("express").Response, err: unknown) {
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

// ---------------------------------------------------------------- Camion

stockRouter.get("/camion", async (req, res) => {
  const vendeurId = req.query.vendeurId as string | undefined;
  if (!vendeurId) return res.status(400).json({ error: "vendeurId requis" });
  const stock = await prisma.stockCamion.findMany({
    where: { vendeurId },
    include: { article: { include: { codesBarres: { select: { codeBarre: true, libelle: true } } } } },
    orderBy: ORDRE_CATALOGUE.map((o) => ({ article: o })),
  });
  res.json(stock);
});

// Mouvements d'un camion ; avec articleId : tout le cycle de vie de l'article
// dans ce camion, du plus ancien au plus récent.
stockRouter.get("/mouvements", async (req, res) => {
  const { vendeurId, articleId } = req.query as Record<string, string | undefined>;
  if (!vendeurId) return res.status(400).json({ error: "vendeurId requis" });
  const mouvements = await prisma.mouvementStock.findMany({
    where: { vendeurId, ...(articleId ? { articleId } : {}) },
    include: { article: true },
    orderBy: { date: articleId ? "asc" : "desc" },
    ...(articleId ? {} : { take: 200 }),
  });
  res.json(mouvements);
});

// Synthèse par article des mouvements d'un camion : chargé, retourné au dépôt,
// vendu, repris chez les clients, ajusté, et stock. Effet sur le camion :
// CHARGEMENT +, RETOUR -, VENTE -, RETOUR_CLIENT +, AJUSTEMENT signé.
// Avec ?dateFrom/dateTo : seulement les mouvements de la période ; pour une
// période révolue, le stock est celui de la fin de période (somme des mouvements).
stockRouter.get("/mouvements/articles", async (req, res) => {
  const vendeurId = req.query.vendeurId as string | undefined;
  if (!vendeurId) return res.status(400).json({ error: "vendeurId requis" });
  const date = plageDates(req.query);
  const finPassee = date?.lte && date.lte < new Date() ? date.lte : null;
  const [groupes, stock] = await Promise.all([
    prisma.mouvementStock.groupBy({
      by: ["articleId", "sens"],
      where: { vendeurId, ...(date ? { date } : {}) },
      _sum: { quantite: true },
      _count: true,
      _max: { date: true },
    }),
    finPassee
      ? prisma.mouvementStock
          .groupBy({ by: ["articleId", "sens"], where: { vendeurId, date: { lte: finPassee } }, _sum: { quantite: true } })
          .then((gs) => {
            const solde = new Map<string, number>();
            for (const g of gs) {
              const q = Number(g._sum.quantite ?? 0);
              const effet = g.sens === "RETOUR" || g.sens === "VENTE" ? -q : q;
              solde.set(g.articleId, (solde.get(g.articleId) ?? 0) + effet);
            }
            return [...solde.entries()].map(([articleId, quantite]) => ({ articleId, quantite }));
          })
      : prisma.stockCamion.findMany({ where: { vendeurId }, select: { articleId: true, quantite: true } }),
  ]);
  const articles = await prisma.article.findMany({ where: { id: { in: [...new Set(groupes.map((g) => g.articleId))] } } });
  const stockMap = new Map(stock.map((s) => [s.articleId, Math.round(Number(s.quantite) * 1000) / 1000]));

  const parArticle = new Map<
    string,
    { charge: number; retourDepot: number; vendu: number; retourClient: number; ajuste: number; nbMouvements: number; dernier: Date | null }
  >();
  for (const g of groupes) {
    const a = parArticle.get(g.articleId) ?? { charge: 0, retourDepot: 0, vendu: 0, retourClient: 0, ajuste: 0, nbMouvements: 0, dernier: null };
    const q = Number(g._sum.quantite ?? 0);
    if (g.sens === "CHARGEMENT") a.charge += q;
    else if (g.sens === "RETOUR") a.retourDepot += q;
    else if (g.sens === "VENTE") a.vendu += q;
    else if (g.sens === "RETOUR_CLIENT") a.retourClient += q;
    else a.ajuste += q; // AJUSTEMENT : quantité déjà signée
    a.nbMouvements += g._count;
    if (g._max.date && (!a.dernier || g._max.date > a.dernier)) a.dernier = g._max.date;
    parArticle.set(g.articleId, a);
  }

  res.json(
    articles
      .map((article) => ({ article, ...parArticle.get(article.id)!, stock: stockMap.get(article.id) ?? 0 }))
      .sort((a, b) => (b.dernier?.getTime() ?? 0) - (a.dernier?.getTime() ?? 0))
  );
});

// Mouvements d'un article, camion par camion (fiche article de l'admin) :
// chargé, retourné au dépôt, vendu, repris aux clients, ajusté, et stock actuel.
stockRouter.get("/mouvements/par-article/:articleId", async (req, res) => {
  const { articleId } = req.params;
  try {
    const article = await prisma.article.findFirst({ where: { id: articleId, societeId: req.societeId }, select: { id: true } });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    const [groupes, stocks] = await Promise.all([
      prisma.mouvementStock.groupBy({
        by: ["vendeurId", "sens"],
        where: { articleId },
        _sum: { quantite: true },
        _max: { date: true },
      }),
      prisma.stockCamion.findMany({ where: { articleId }, select: { vendeurId: true, quantite: true } }),
    ]);
    const ids = [...new Set([...groupes.map((g) => g.vendeurId), ...stocks.map((s) => s.vendeurId)])];
    const vendeurs = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, nom: true, code: true } });
    const resultat = vendeurs.map((vendeur) => {
      const r = { vendeur, charge: 0, retourDepot: 0, vendu: 0, retourClient: 0, ajuste: 0, stock: 0, dernier: null as Date | null };
      for (const g of groupes.filter((x) => x.vendeurId === vendeur.id)) {
        const q = Number(g._sum.quantite ?? 0);
        if (g.sens === "CHARGEMENT") r.charge += q;
        else if (g.sens === "RETOUR") r.retourDepot += q;
        else if (g.sens === "VENTE") r.vendu += q;
        else if (g.sens === "RETOUR_CLIENT") r.retourClient += q;
        else r.ajuste += q; // AJUSTEMENT : déjà signé
        if (g._max.date && (!r.dernier || g._max.date > r.dernier)) r.dernier = g._max.date;
      }
      r.stock = Number(stocks.find((x) => x.vendeurId === vendeur.id)?.quantite ?? 0);
      return r;
    });
    res.json(resultat.sort((a, b) => a.vendeur.nom.localeCompare(b.vendeur.nom)));
  } catch (err) {
    return serverError(res, err);
  }
});

// ---------------------------------------------------------------- Numéros des bons

// Prochain N° proposé pour un bon d'entrée, de sortie (chargement) ou de retour :
// « 2026-0001 », une suite par type, qui repart chaque année. Basé sur le plus
// grand numéro déjà utilisé (bons supprimés compris) : un numéro n'est jamais
// réattribué ; un N° saisi à la main dans un autre format est ignoré.
stockRouter.get("/numero-suivant", async (req, res) => {
  const type = req.query.type as string | undefined;
  if (type !== "ENTREE" && type !== "SORTIE" && type !== "RETOUR") {
    return res.status(400).json({ error: "type : ENTREE, SORTIE ou RETOUR" });
  }
  try {
    const prefixe = `${new Date().getFullYear()}-`;
    const where = { reference: { startsWith: prefixe } };
    const references =
      type === "ENTREE"
        ? await prisma.entreeDepot.findMany({ where: { ...where, societeId: req.societeId }, select: { reference: true } })
        : await prisma.chargementCamion.findMany({
            where: { ...where, sens: type === "SORTIE" ? "CHARGEMENT" : "RETOUR", vendeur: { societeId: req.societeId } },
            select: { reference: true },
          });
    const max = references.reduce((m, r) => {
      const seq = r.reference?.match(/^\d{4}-(\d+)$/)?.[1];
      return seq ? Math.max(m, Number(seq)) : m;
    }, 0);
    res.json({ numero: `${prefixe}${String(max + 1).padStart(4, "0")}` });
  } catch (err) {
    return serverError(res, err);
  }
});

// ---------------------------------------------------------------- Dépôt

// Tous les articles actifs avec leur quantité au dépôt (0 si jamais reçue).
// `aConfirmer` : article qui n'a jamais eu de stock et dont l'admin n'a pas encore
// confirmé qu'il n'en a réellement pas (écran « À compléter »).
stockRouter.get("/depot", async (req, res) => {
  const articles = await prisma.article.findMany({
    where: { deletedAt: null, societeId: req.societeId },
    include: {
      stockDepot: true,
      codesBarres: { select: { codeBarre: true, libelle: true } },
      // Lots datés, le plus proche d'abord : colonne « Expiration » du tableau du dépôt (date et pièces concernées).
      lots: { where: { quantite: { gt: 0 }, dateExpiration: { not: null } }, select: { dateExpiration: true, quantite: true }, orderBy: { dateExpiration: "asc" } },
    },
    orderBy: ORDRE_CATALOGUE,
  });
  res.json(
    articles.map(({ stockDepot, lots, ...article }) => {
      const premiere = lots[0]?.dateExpiration ?? null;
      // Plusieurs lots peuvent avoir la même date (réceptions différentes) : leurs pièces s'additionnent.
      const aCetteDate = premiere ? lots.filter((l) => l.dateExpiration!.getTime() === premiere.getTime()).reduce((s, l) => s + Number(l.quantite), 0) : null;
      return {
        articleId: article.id,
        quantite: Number(stockDepot?.quantite ?? 0),
        aConfirmer: !stockDepot && !article.stockVerifieAt,
        prochaineExpiration: premiere ? premiere.toISOString().slice(0, 10) : null,
        quantiteExpiration: aCetteDate === null ? null : Math.round(aCetteDate * 1000) / 1000,
        article,
      };
    })
  );
});

const confirmerSchema = z.object({ articleIds: z.array(z.string().uuid()).min(1).max(5000) });

// L'admin confirme que ces articles n'ont réellement aucun stock au dépôt.
stockRouter.post("/depot/sans-stock-confirme", async (req, res) => {
  const parsed = confirmerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { count } = await prisma.article.updateMany({
      where: { id: { in: parsed.data.articleIds }, societeId: req.societeId, deletedAt: null },
      data: { stockVerifieAt: new Date() },
    });
    res.json({ confirmes: count });
  } catch (err) {
    return serverError(res, err);
  }
});

stockRouter.get("/depot/mouvements", async (req, res) => {
  const mouvements = await prisma.mouvementDepot.findMany({
    where: { article: { societeId: req.societeId } },
    include: { article: true, vendeur: { select: { id: true, nom: true, code: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  res.json(mouvements);
});

const entreeSchema = z.object({
  reference: z.string().max(120).optional(),
  // dateExpiration : date d'expiration des pièces reçues sur la ligne (facultative).
  // prixAchat : nouveau prix d'achat HT facturé par le fournisseur ; prixVente : nouveau prix de vente HT
  // (par défaut, la marge actuelle de l'article est conservée).
  lignes: z
    .array(
      ligneQuantiteSchema.extend({
        dateExpiration: dateExpirationSchema.nullish(),
        prixAchat: z.number().nonnegative().optional(),
        prixVente: z.number().nonnegative().optional(),
      }),
    )
    .min(1),
});

type LigneEntree = z.infer<typeof entreeSchema>["lignes"][number];

/**
 * Réception de marchandise au dépôt (B° Entrée) : stock, lots, prix d'achat / de vente, mouvements.
 * Sert au bon d'entrée et aux achats fournisseurs (BL et factures), qui créent leur entrée.
 */
export async function creerEntreeDepot(tx: Prisma.TransactionClient, societeId: string, adminId: string, reference: string | undefined, lignes: LigneEntree[]) {
    const doc = await tx.entreeDepot.create({
      data: { reference, adminId, societeId },
    });
    for (const l of lignes) {
      const article = await tx.article.findUniqueOrThrow({ where: { id: l.articleId } });
      const unites = enUnites(l.quantite, l.unite, article.colisage);
      await tx.stockDepot.upsert({
        where: { articleId: l.articleId },
        create: { articleId: l.articleId, quantite: unites },
        update: { quantite: { increment: unites } },
      });
      await tx.ligneEntreeDepot.create({
        data: {
          entreeId: doc.id,
          articleId: l.articleId,
          quantite: unites,
          dateExpiration: l.dateExpiration ?? null,
          prixAchat: l.prixAchat ?? null,
        },
      });
      if (l.prixAchat !== undefined || l.prixVente !== undefined) {
        const achat = l.prixAchat ?? Number(article.prixAchat);
        const tva = Number(article.tva);
        const fodec = Number(article.fodec);
        // Sans prix de vente saisi : la marge actuelle (en % du prix d'achat) est conservée.
        const margeActuelle = Number(article.prixAchat) > 0 ? (Number(article.prixVente) / Number(article.prixAchat) - 1) * 100 : null;
        const vente =
          l.prixVente ??
          (l.prixAchat !== undefined && margeActuelle !== null ? htDepuisMarge(achat, margeActuelle, tva, fodec) : Number(article.prixVente));
        const maj = await tx.article.update({ where: { id: article.id }, data: { prixAchat: achat, prixVente: vente } });
        await noterPrix(tx, article.id, maj, article, "ENTREE", { entreeId: doc.id, adminId });
      }
      await ajouterLot(tx, l.articleId, l.dateExpiration ?? null, unites, doc.id);
      await tx.mouvementDepot.create({
        data: { articleId: l.articleId, sens: "ENTREE", quantite: unites, reference, entreeId: doc.id },
      });
    }
    return doc;
}

// Réception de marchandise au dépôt (livraison fournisseur, stock initial).
stockRouter.post("/depot/entree", async (req, res) => {
  const parsed = entreeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  try {
    // Le document EntreeDepot regroupe la réception pour l'historique (et sa suppression).
    const entree = await prisma.$transaction((tx) => creerEntreeDepot(tx, req.societeId!, req.user!.id, data.reference, data.lignes));
    res.status(201).json(entree);
  } catch (err) {
    return serverError(res, err);
  }
});

// ---------------------------------------------------------------- Chargement

const chargementSchema = z.object({
  id: z.string().uuid().optional(),
  vendeurId: z.string().uuid(),
  sens: z.enum(["CHARGEMENT", "RETOUR"]).default("CHARGEMENT"),
  reference: z.string().trim().max(120).optional(),
  lignes: z
    .array(
      // Compatibilité : l'ancien format { quantiteColis } reste accepté.
      z.union([
        ligneQuantiteSchema,
        z
          .object({ articleId: z.string().uuid(), quantiteColis: z.number().positive() })
          .transform((l) => ({ articleId: l.articleId, quantite: l.quantiteColis, unite: "COLIS" as const })),
      ])
    )
    .min(1),
});

// CHARGEMENT : dépôt -> camion (le dépôt doit avoir la quantité).
// RETOUR : camion -> dépôt (retour des invendus).
stockRouter.post("/chargement", async (req, res) => {
  const parsed = chargementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const { vendeurId } = data;
  const reference = data.reference || undefined;
  const chargement = data.sens === "CHARGEMENT";

  try {
    const result = await prisma.$transaction(async (tx) => {
      const lignes: { articleId: string; quantiteColis: number; quantiteUnites: number }[] = [];

      for (const l of data.lignes) {
        const article = await tx.article.findUniqueOrThrow({ where: { id: l.articleId } });
        const unites = enUnites(l.quantite, l.unite, article.colisage);

        // Le chargement n'est jamais bloqué par le stock théorique du dépôt : la marchandise réelle prime. Le
        // stock dépôt peut devenir négatif ; l'écart reste visible jusqu'au prochain inventaire.

        const signeDepot = chargement ? -1 : 1;
        await tx.stockDepot.upsert({
          where: { articleId: l.articleId },
          create: { articleId: l.articleId, quantite: signeDepot * unites },
          update: { quantite: { increment: signeDepot * unites } },
        });
        // Chargement : FEFO (les dates les plus proches partent). Retour : pièces sans date.
        await synchroniserLots(tx, l.articleId);
        await tx.stockCamion.upsert({
          where: { vendeurId_articleId: { vendeurId, articleId: l.articleId } },
          create: { vendeurId, articleId: l.articleId, quantite: -signeDepot * unites },
          update: { quantite: { increment: -signeDepot * unites } },
        });
        await tx.mouvementStock.create({
          data: { vendeurId, articleId: l.articleId, sens: data.sens, quantite: unites, reference },
        });
        await tx.mouvementDepot.create({
          data: { articleId: l.articleId, sens: data.sens, quantite: unites, vendeurId, reference },
        });

        lignes.push({
          articleId: l.articleId,
          quantiteColis: article.colisage > 0 ? unites / article.colisage : unites,
          quantiteUnites: unites,
        });
      }

      return tx.chargementCamion.create({
        data: { id: data.id, vendeurId, sens: data.sens, reference, lignes: { create: lignes } },
        include: { lignes: true },
      });
    });
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof StockError) return res.status(409).json({ error: err.message });
    return serverError(res, err);
  }
});

// ---------------------------------------------------------------- Dates d'expiration (lots du dépôt)

const ALERTE_PAR_DEFAUT = 30;

/** Article suivi pour la péremption ? Sa catégorie (ou la principale qui la contient) le dit. */
async function reglesPeremption(societeId: string) {
  const cats = await prisma.categorie.findMany({ where: { societeId }, select: { id: true, parentId: true, perissable: true, alerteJours: true } });
  const parId = new Map(cats.map((c) => [c.id, c]));
  return (categorieId: string | null) => {
    const c = categorieId ? parId.get(categorieId) : undefined;
    const parent = c?.parentId ? parId.get(c.parentId) : undefined;
    const source = c?.perissable ? c : parent?.perissable ? parent : undefined;
    // Une sous-catégorie sans délai propre reprend celui de sa catégorie principale.
    return source ? { alerteJours: c?.alerteJours ?? source.alerteJours ?? parent?.alerteJours ?? ALERTE_PAR_DEFAUT } : null;
  };
}

// Fiche article : son stock au dépôt réparti par date d'expiration (lots, du plus proche au plus lointain, puis
// sans date), d'où vient chaque date (dernier achat reçu avec cette date) et ce qu'en ont les camions.
stockRouter.get("/depot/lots/:articleId", async (req, res) => {
  try {
    const article = await prisma.article.findFirst({
      where: { id: req.params.articleId, societeId: req.societeId, deletedAt: null },
      include: { codesBarres: { select: { codeBarre: true, libelle: true } } },
    });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    const [regle, depot, lots, camions] = await Promise.all([
      reglesPeremption(req.societeId!),
      prisma.stockDepot.findUnique({ where: { articleId: article.id } }),
      prisma.lotDepot.findMany({ where: { articleId: article.id, quantite: { gt: 0 } } }),
      prisma.stockCamion.findMany({ where: { articleId: article.id, quantite: { not: 0 } }, include: { vendeur: { select: { id: true, nom: true } } } }),
    ]);
    const dates = [...new Set(lots.filter((l) => l.dateExpiration).map((l) => l.dateExpiration!.getTime()))].map((t) => new Date(t));
    const receptions = dates.length
      ? await prisma.ligneAchat.findMany({
          where: { articleId: article.id, dateExpiration: { in: dates }, achat: { deletedAt: null } },
          select: { dateExpiration: true, quantite: true, achat: { select: { type: true, numero: true, date: true, fournisseurLibre: true, fournisseur: { select: { nom: true, divers: true } } } } },
          orderBy: { achat: { date: "desc" } },
        })
      : [];
    const alerte = regle(article.categorieId)?.alerteJours ?? null;
    const parDate = new Map<string, { dateExpiration: string | null; quantite: number; ids: string[] }>();
    for (const l of lots) {
      const cle = dateEnTexte(l.dateExpiration) ?? "";
      const g = parDate.get(cle) ?? { dateExpiration: dateEnTexte(l.dateExpiration), quantite: 0, ids: [] };
      g.quantite += Number(l.quantite);
      g.ids.push(l.id);
      parDate.set(cle, g);
    }
    const lignes = [...parDate.values()]
      .map((g) => {
        const jours = g.dateExpiration ? joursRestants(new Date(`${g.dateExpiration}T00:00:00`)) : null;
        const r = g.dateExpiration ? receptions.find((x) => dateEnTexte(x.dateExpiration) === g.dateExpiration) : undefined;
        return {
          ...g,
          quantite: Math.round(g.quantite * 1000) / 1000,
          joursRestants: jours,
          statut: jours === null ? "SANS_DATE" : jours < 0 ? "EXPIRE" : alerte !== null && jours <= alerte ? "PROCHE" : "OK",
          provenance: r
            ? {
                type: r.achat.type,
                numero: r.achat.numero,
                date: r.achat.date,
                fournisseur: r.achat.fournisseur.divers ? r.achat.fournisseurLibre || null : r.achat.fournisseur.nom,
              }
            : null,
        };
      })
      .sort((a, b) => (a.joursRestants ?? Infinity) - (b.joursRestants ?? Infinity));
    res.json({
      article,
      depot: Number(depot?.quantite ?? 0),
      // Suivi de péremption : la catégorie de l'article est périssable (sinon les dates sont seulement informatives).
      perissable: alerte !== null && !article.sansPeremption,
      alerteJours: alerte,
      lots: lignes,
      camions: camions.map((c) => ({ vendeurId: c.vendeur.id, vendeur: c.vendeur.nom, quantite: Number(c.quantite) })),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

// Tableau de bord des péremptions : lots datés (expirés / à surveiller) et articles périssables
// dont des pièces n'ont pas encore de date.
stockRouter.get("/depot/peremption", async (req, res) => {
  try {
    const [regle, lots] = await Promise.all([
      reglesPeremption(req.societeId!),
      prisma.lotDepot.findMany({
        where: { quantite: { gt: 0 }, article: { societeId: req.societeId, deletedAt: null, sansPeremption: false } },
        include: { article: { include: { codesBarres: { select: { codeBarre: true, libelle: true } } } } },
      }),
    ]);

    const dates: Array<Record<string, unknown> & { joursRestants: number }> = [];
    const sansDate = new Map<string, { article: (typeof lots)[number]["article"]; quantite: number }>();
    let expires = 0;
    let proches = 0;
    for (const lot of lots) {
      const r = regle(lot.article.categorieId);
      if (!r) continue;
      if (!lot.dateExpiration) {
        const cur = sansDate.get(lot.articleId);
        sansDate.set(lot.articleId, { article: lot.article, quantite: (cur?.quantite ?? 0) + Number(lot.quantite) });
        continue;
      }
      const jours = joursRestants(lot.dateExpiration);
      const statut = jours < 0 ? "EXPIRE" : jours <= r.alerteJours ? "PROCHE" : "OK";
      if (statut === "EXPIRE") expires++;
      else if (statut === "PROCHE") proches++;
      dates.push({
        id: lot.id,
        articleId: lot.articleId,
        article: lot.article,
        dateExpiration: dateEnTexte(lot.dateExpiration),
        quantite: Number(lot.quantite),
        joursRestants: jours,
        alerteJours: r.alerteJours,
        statut,
      });
    }
    dates.sort((a, b) => a.joursRestants - b.joursRestants);
    const aDater = [...sansDate.values()]
      .sort((a, b) => comparerOrdreCatalogue(a.article, b.article))
      .map((s) => ({ articleId: s.article.id, article: s.article, quantiteSansDate: s.quantite }));

    res.json({ resume: { expires, proches, aDater: aDater.length }, lots: dates, aDater });
  } catch (err) {
    return serverError(res, err);
  }
});

const daterSchema = z.object({
  articleId: z.string().uuid(),
  // Répartit tout ou partie des pièces « sans date » entre des dates.
  lignes: z.array(z.object({ dateExpiration: dateExpirationSchema, quantite: z.number().positive() })).min(1),
});

stockRouter.post("/depot/lots/dater", async (req, res) => {
  const parsed = daterSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { articleId, lignes } = parsed.data;
  try {
    const article = await prisma.article.findFirst({ where: { id: articleId, societeId: req.societeId, deletedAt: null }, select: { id: true } });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    await prisma.$transaction(async (tx) => {
      const sansDate = await tx.lotDepot.findMany({ where: { articleId, dateExpiration: null, quantite: { gt: 0 } }, orderBy: { createdAt: "asc" } });
      const dispo = sansDate.reduce((s, l) => s + Number(l.quantite), 0);
      const demande = lignes.reduce((s, l) => s + l.quantite, 0);
      if (demande > dispo + 1e-9) throw new StockError(`Seulement ${dispo} pièces sans date pour cet article.`);
      let aPrendre = demande;
      for (const lot of sansDate) {
        if (aPrendre <= 1e-9) break;
        const q = Number(lot.quantite);
        const pris = Math.min(q, aPrendre);
        aPrendre -= pris;
        if (pris >= q) await tx.lotDepot.delete({ where: { id: lot.id } });
        else await tx.lotDepot.update({ where: { id: lot.id }, data: { quantite: Math.round((q - pris) * 1000) / 1000 } });
      }
      for (const l of lignes) await ajouterLot(tx, articleId, l.dateExpiration, l.quantite);
    });
    res.status(204).send();
  } catch (err) {
    if (err instanceof StockError) return res.status(400).json({ error: err.message });
    return serverError(res, err);
  }
});

// Corriger la date d'un lot.
stockRouter.put("/depot/lots/:id", async (req, res) => {
  const parsed = z.object({ dateExpiration: dateExpirationSchema.nullable() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const maj = await prisma.lotDepot.updateMany({
      where: { id: req.params.id, article: { societeId: req.societeId } },
      data: { dateExpiration: parsed.data.dateExpiration },
    });
    if (maj.count === 0) return res.status(404).json({ error: "Lot introuvable" });
    res.status(204).send();
  } catch (err) {
    return serverError(res, err);
  }
});

// Retirer des pièces d'un lot du dépôt (périmées, jetées, remises au fournisseur).
stockRouter.post("/depot/lots/:id/retirer", async (req, res) => {
  const parsed = z.object({ quantite: z.number().positive().optional(), reference: z.string().trim().max(120).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    await prisma.$transaction(async (tx) => {
      const lot = await tx.lotDepot.findFirst({ where: { id: req.params.id, article: { societeId: req.societeId } } });
      if (!lot) throw new StockError("Lot introuvable");
      const q = Number(lot.quantite);
      const retire = Math.min(parsed.data.quantite ?? q, q);
      if (retire >= q) await tx.lotDepot.delete({ where: { id: lot.id } });
      else await tx.lotDepot.update({ where: { id: lot.id }, data: { quantite: Math.round((q - retire) * 1000) / 1000 } });
      await tx.stockDepot.update({ where: { articleId: lot.articleId }, data: { quantite: { decrement: retire } } });
      await tx.mouvementDepot.create({
        data: { articleId: lot.articleId, sens: "AJUSTEMENT", quantite: -retire, reference: parsed.data.reference || "Retrait de produits périmés" },
      });
    });
    res.status(204).send();
  } catch (err) {
    if (err instanceof StockError) return res.status(404).json({ error: err.message });
    return serverError(res, err);
  }
});
