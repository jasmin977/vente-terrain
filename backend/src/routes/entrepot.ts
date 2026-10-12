import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ORDRE_CATALOGUE } from "../lib/ordreArticles";
import { calculerDisposition } from "../lib/disposition";
import { etiquetteActive, seuilAlerte, statutStock } from "../lib/statutStock";
import { ttcDepuisHT } from "../lib/tarifs";
import { ciblesDeLaSociete, requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Plan du dépôt en 3D (admin) : bâtiment, étagères, articles rangés, camions garés dehors.
// Les emplacements sont indicatifs : ils ne bloquent aucun mouvement de stock.
export const entrepotRouter = Router();
entrepotRouter.use(requireAuth, requireAdmin, requireSociete, ciblesDeLaSociete);

const serverError = (res: import("express").Response, err: unknown) => {
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
};

async function entrepotDe(societeId: string) {
  return prisma.entrepot.upsert({ where: { societeId }, create: { societeId }, update: {} });
}

entrepotRouter.get("/", async (req, res) => {
  try {
    const societeId = req.societeId!;
    const entrepot = await entrepotDe(societeId);
    const [racks, stocks, assignes, camions] = await Promise.all([
      prisma.entrepotRack.findMany({
        where: { entrepotId: entrepot.id },
        orderBy: [{ allee: "asc" }, { nom: "asc" }],
        include: {
          emplacements: {
            include: {
              article: {
                select: {
                  id: true,
                  designation: true,
                  marque: true,
                  unit: true,
                  img: true,
                  colisage: true,
                  deletedAt: true,
                  prixVente: true,
                  tva: true,
                  fodec: true,
                  stockMini: true,
                  etiquette: true,
                  etiquetteJusqua: true,
                },
              },
            },
            orderBy: [{ niveau: "asc" }, { travee: "asc" }],
          },
        },
      }),
      prisma.stockDepot.findMany({ where: { quantite: { gt: 0 }, article: { societeId, deletedAt: null } }, select: { articleId: true, quantite: true } }),
      prisma.emplacementArticle.groupBy({ by: ["articleId"], where: { rack: { entrepotId: entrepot.id } }, _sum: { quantite: true } }),
      prisma.user.findMany({
        where: { societeId, role: "VENDEUR", actif: true },
        select: { id: true, nom: true, code: true, stockCamion: { where: { quantite: { gt: 0 } }, select: { quantite: true } } },
        orderBy: { nom: "asc" },
      }),
    ]);

    const rangeParArticle = new Map(assignes.map((a) => [a.articleId, Number(a._sum.quantite ?? 0)]));
    // Stock réel et dernier réapprovisionnement (bon d'entrée) des articles posés sur le plan.
    const idsPlan = [...new Set(racks.flatMap((r) => r.emplacements.map((e) => e.articleId)))];
    const [stockPlan, entrees] = await Promise.all([
      prisma.stockDepot.findMany({ where: { articleId: { in: idsPlan } }, select: { articleId: true, quantite: true } }),
      prisma.mouvementDepot.groupBy({ by: ["articleId"], where: { articleId: { in: idsPlan }, sens: "ENTREE" }, _max: { date: true } }),
    ]);
    const stockDe = new Map(stockPlan.map((s) => [s.articleId, Number(s.quantite)]));
    const derniereEntree = new Map(entrees.map((e) => [e.articleId, e._max.date]));
    const maintenant = new Date();
    let nonRangeArticles = 0;
    let nonRangePieces = 0;
    let stockPieces = 0;
    for (const s of stocks) {
      const q = Number(s.quantite);
      stockPieces += q;
      const manque = q - (rangeParArticle.get(s.articleId) ?? 0);
      if (manque > 1e-9) {
        nonRangeArticles++;
        nonRangePieces += manque;
      }
    }

    res.json({
      entrepot: { largeur: entrepot.largeur, profondeur: entrepot.profondeur },
      racks: racks.map((r) => ({
        id: r.id,
        nom: r.nom,
        allee: r.allee,
        x: r.x,
        z: r.z,
        rotation: r.rotation,
        niveaux: r.niveaux,
        travees: r.travees,
        emplacements: r.emplacements
          .filter((e) => !e.article.deletedAt)
          .map((e) => {
            const a = e.article;
            const stock = stockDe.get(a.id) ?? 0;
            const entree = {
              stock,
              colisage: a.colisage,
              stockMini: a.stockMini === null ? null : Number(a.stockMini),
              etiquette: a.etiquette,
              etiquetteJusqua: a.etiquetteJusqua,
            };
            return {
              niveau: e.niveau,
              travee: e.travee,
              quantite: Number(e.quantite),
              article: {
                id: a.id,
                designation: a.designation,
                marque: a.marque,
                unit: a.unit,
                img: a.img,
                colisage: a.colisage,
                // Statut de stock du dépôt (couleur du plan) : le stock est celui de l'article entier, pas de la case.
                stock,
                seuil: seuilAlerte(entree),
                statut: statutStock(entree, maintenant),
                etiquette: etiquetteActive(entree, maintenant),
                prixTTC: ttcDepuisHT(Number(a.prixVente), Number(a.tva), Number(a.fodec)),
                derniereEntree: derniereEntree.get(a.id)?.toISOString() ?? null,
              },
            };
          }),
      })),
      camions: camions.map((c) => ({
        vendeurId: c.id,
        nom: c.nom,
        code: c.code,
        nbArticles: c.stockCamion.length,
        totalPieces: c.stockCamion.reduce((s, l) => s + Number(l.quantite), 0),
      })),
      resume: { stockArticles: stocks.length, stockPieces, nonRangeArticles, nonRangePieces },
      // Pour l'indicateur « en direct » du plan.
      genereLe: maintenant.toISOString(),
    });
  } catch (err) {
    return serverError(res, err);
  }
});

const batimentSchema = z.object({ largeur: z.number().min(10).max(200), profondeur: z.number().min(10).max(200) });

entrepotRouter.put("/", async (req, res) => {
  const parsed = batimentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dimensions invalides (10 à 200 m)" });
  try {
    const e = await entrepotDe(req.societeId!);
    await prisma.entrepot.update({ where: { id: e.id }, data: parsed.data });
    res.status(204).send();
  } catch (err) {
    return serverError(res, err);
  }
});

const rackSchema = z.object({
  nom: z.string().trim().min(1).max(20),
  allee: z.string().trim().min(1).max(20),
  x: z.number().min(-100).max(100),
  z: z.number().min(-100).max(100),
  rotation: z.union([z.literal(0), z.literal(90)]).default(0),
  niveaux: z.number().int().min(1).max(8),
  travees: z.number().int().min(1).max(12),
});

entrepotRouter.post("/racks", async (req, res) => {
  const parsed = rackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Étagère invalide" });
  try {
    const e = await entrepotDe(req.societeId!);
    const rack = await prisma.entrepotRack.create({ data: { ...parsed.data, entrepotId: e.id } });
    res.status(201).json({ id: rack.id });
  } catch (err) {
    return serverError(res, err);
  }
});

entrepotRouter.put("/racks/:id", async (req, res) => {
  const parsed = rackSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Étagère invalide" });
  try {
    const rack = await prisma.entrepotRack.findFirst({ where: { id: req.params.id, entrepot: { societeId: req.societeId } } });
    if (!rack) return res.status(404).json({ error: "Étagère introuvable" });
    // Moins d'étages ou de travées : les articles rangés dans les cases supprimées sont retirés du plan.
    const niveaux = parsed.data.niveaux ?? rack.niveaux;
    const travees = parsed.data.travees ?? rack.travees;
    await prisma.$transaction([
      prisma.emplacementArticle.deleteMany({ where: { rackId: rack.id, OR: [{ niveau: { gte: niveaux } }, { travee: { gte: travees } }] } }),
      prisma.entrepotRack.update({ where: { id: rack.id }, data: parsed.data }),
    ]);
    res.status(204).send();
  } catch (err) {
    return serverError(res, err);
  }
});

entrepotRouter.delete("/racks/:id", async (req, res) => {
  try {
    const { count } = await prisma.entrepotRack.deleteMany({ where: { id: req.params.id, entrepot: { societeId: req.societeId } } });
    if (count === 0) return res.status(404).json({ error: "Étagère introuvable" });
    res.status(204).send();
  } catch (err) {
    return serverError(res, err);
  }
});

const genererSchema = z.object({
  allees: z.number().int().min(1).max(8),
  racksParRangee: z.number().int().min(1).max(8),
  niveaux: z.number().int().min(1).max(8),
  travees: z.number().int().min(1).max(12),
  remplacer: z.boolean().default(false),
});

// Dispose automatiquement des allées d'étagères (et agrandit le bâtiment si besoin).
entrepotRouter.post("/generer", async (req, res) => {
  const parsed = genererSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Paramètres invalides" });
  const o = parsed.data;
  try {
    const e = await entrepotDe(req.societeId!);
    const existantes = await prisma.entrepotRack.count({ where: { entrepotId: e.id } });
    if (existantes > 0 && !o.remplacer) return res.status(409).json({ error: "Le dépôt a déjà des étagères : remplacer la disposition ?" });
    const d = calculerDisposition({ allees: o.allees, racksParRangee: o.racksParRangee, travees: o.travees, largeurMin: e.largeur, profondeurMin: e.profondeur });
    await prisma.$transaction([
      prisma.entrepotRack.deleteMany({ where: { entrepotId: e.id } }),
      prisma.entrepot.update({ where: { id: e.id }, data: { largeur: d.largeur, profondeur: d.profondeur } }),
      prisma.entrepotRack.createMany({ data: d.racks.map((r) => ({ ...r, entrepotId: e.id, niveaux: o.niveaux, travees: o.travees })) }),
    ]);
    res.status(201).json({ racks: d.racks.length });
  } catch (err) {
    return serverError(res, err);
  }
});

const emplacementSchema = z.object({
  rackId: z.string().uuid(),
  niveau: z.number().int().min(0),
  travee: z.number().int().min(0),
  articleId: z.string().uuid(),
  // 0 : retire l'article de la case.
  quantite: z.number().min(0).max(1_000_000),
});

entrepotRouter.put("/emplacements", async (req, res) => {
  const parsed = emplacementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Emplacement invalide" });
  const { rackId, niveau, travee, articleId, quantite } = parsed.data;
  try {
    const rack = await prisma.entrepotRack.findFirst({ where: { id: rackId, entrepot: { societeId: req.societeId } } });
    if (!rack) return res.status(404).json({ error: "Étagère introuvable" });
    if (niveau >= rack.niveaux || travee >= rack.travees) return res.status(400).json({ error: "Cette case n'existe pas sur l'étagère" });
    const article = await prisma.article.findFirst({ where: { id: articleId, societeId: req.societeId, deletedAt: null }, select: { id: true } });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    const cle = { rackId_niveau_travee_articleId: { rackId, niveau, travee, articleId } };
    if (quantite === 0) await prisma.emplacementArticle.deleteMany({ where: { rackId, niveau, travee, articleId } });
    else await prisma.emplacementArticle.upsert({ where: cle, create: { rackId, niveau, travee, articleId, quantite }, update: { quantite } });
    res.status(204).send();
  } catch (err) {
    return serverError(res, err);
  }
});

// Range d'un coup les articles en stock qui n'ont encore aucun emplacement, par catégorie, case après case.
entrepotRouter.post("/ranger-auto", async (req, res) => {
  try {
    const societeId = req.societeId!;
    const e = await entrepotDe(societeId);
    const racks = await prisma.entrepotRack.findMany({ where: { entrepotId: e.id }, orderBy: [{ allee: "asc" }, { nom: "asc" }] });
    if (racks.length === 0) return res.status(409).json({ error: "Créez d'abord les étagères du dépôt" });
    const dejaRanges = new Set((await prisma.emplacementArticle.findMany({ where: { rack: { entrepotId: e.id } }, select: { articleId: true }, distinct: ["articleId"] })).map((x) => x.articleId));
    const articles = await prisma.article.findMany({
      where: { societeId, deletedAt: null, stockDepot: { is: { quantite: { gt: 0 } } } },
      include: { stockDepot: true, categorie: { select: { ordre: true, parentId: true, parent: { select: { ordre: true } } } } },
      orderBy: ORDRE_CATALOGUE,
    });
    const aRanger = articles.filter((a) => !dejaRanges.has(a.id));
    // Même catégorie ensemble : catégorie principale, sous-catégorie, puis ordre du catalogue.
    aRanger.sort(
      (a, b) =>
        (a.categorie?.parent?.ordre ?? a.categorie?.ordre ?? 1e9) - (b.categorie?.parent?.ordre ?? b.categorie?.ordre ?? 1e9) ||
        (a.categorie?.ordre ?? 1e9) - (b.categorie?.ordre ?? 1e9) ||
        (a.ordre ?? 1e9) - (b.ordre ?? 1e9),
    );
    const cases = racks.flatMap((r) =>
      Array.from({ length: r.niveaux }, (_, niveau) => Array.from({ length: r.travees }, (_, travee) => ({ rackId: r.id, niveau, travee }))).flat(),
    );
    // Les cases d'un même étage se suivent le long d'un rack ; on remplit en répartissant les articles sur toutes les cases.
    const parCase = Math.max(1, Math.ceil(aRanger.length / cases.length));
    const lignes = aRanger.map((a, i) => ({ ...cases[Math.min(cases.length - 1, Math.floor(i / parCase))], articleId: a.id, quantite: a.stockDepot!.quantite }));
    if (lignes.length) await prisma.emplacementArticle.createMany({ data: lignes, skipDuplicates: true });
    res.json({ ranges: lignes.length });
  } catch (err) {
    return serverError(res, err);
  }
});
