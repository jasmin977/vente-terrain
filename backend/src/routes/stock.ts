import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { plageDates } from "../utils/plage";

export const stockRouter = Router();
// Tout le module stock est réservé à l'admin : le vendeur ne doit pas connaître
// le stock théorique de son camion (contrôle par inventaire).
stockRouter.use(requireAuth, requireAdmin);

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
    include: { article: true },
    orderBy: { article: { designation: "asc" } },
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
        ? await prisma.entreeDepot.findMany({ where, select: { reference: true } })
        : await prisma.chargementCamion.findMany({
            where: { ...where, sens: type === "SORTIE" ? "CHARGEMENT" : "RETOUR" },
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
stockRouter.get("/depot", async (_req, res) => {
  const articles = await prisma.article.findMany({
    where: { deletedAt: null },
    include: { stockDepot: true },
    orderBy: { designation: "asc" },
  });
  res.json(
    articles.map(({ stockDepot, ...article }) => ({
      articleId: article.id,
      quantite: Number(stockDepot?.quantite ?? 0),
      article,
    }))
  );
});

stockRouter.get("/depot/mouvements", async (_req, res) => {
  const mouvements = await prisma.mouvementDepot.findMany({
    include: { article: true, vendeur: { select: { id: true, nom: true, code: true } } },
    orderBy: { date: "desc" },
    take: 200,
  });
  res.json(mouvements);
});

const entreeSchema = z.object({
  reference: z.string().max(120).optional(),
  lignes: z.array(ligneQuantiteSchema).min(1),
});

// Réception de marchandise au dépôt (livraison fournisseur, stock initial).
stockRouter.post("/depot/entree", async (req, res) => {
  const parsed = entreeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  try {
    // Le document EntreeDepot regroupe la réception pour l'historique (et sa suppression).
    const entree = await prisma.$transaction(async (tx) => {
      const doc = await tx.entreeDepot.create({ data: { reference: data.reference, adminId: req.user!.id } });
      for (const l of data.lignes) {
        const article = await tx.article.findUniqueOrThrow({ where: { id: l.articleId } });
        const unites = enUnites(l.quantite, l.unite, article.colisage);
        await tx.stockDepot.upsert({
          where: { articleId: l.articleId },
          create: { articleId: l.articleId, quantite: unites },
          update: { quantite: { increment: unites } },
        });
        await tx.ligneEntreeDepot.create({ data: { entreeId: doc.id, articleId: l.articleId, quantite: unites } });
        await tx.mouvementDepot.create({
          data: { articleId: l.articleId, sens: "ENTREE", quantite: unites, reference: data.reference, entreeId: doc.id },
        });
      }
      return doc;
    });
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

        if (chargement) {
          const depot = await tx.stockDepot.findUnique({ where: { articleId: l.articleId } });
          const dispo = Number(depot?.quantite ?? 0);
          if (dispo < unites) {
            throw new StockError(
              `Stock dépôt insuffisant pour ${article.designation} : ${dispo} pièces disponibles, ${unites} demandées.`
            );
          }
        }

        const signeDepot = chargement ? -1 : 1;
        await tx.stockDepot.upsert({
          where: { articleId: l.articleId },
          create: { articleId: l.articleId, quantite: signeDepot * unites },
          update: { quantite: { increment: signeDepot * unites } },
        });
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
