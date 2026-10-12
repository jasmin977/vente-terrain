import { Router, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { synchroniserLots } from "../lib/lotsDepot";
import { comparerOrdreCatalogue } from "../lib/ordreArticles";
import { ciblesDeLaSociete, requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Inventaires du stock camion ou du dépôt — réservés à l'admin.
//
// Cycle : l'admin ouvre un inventaire (EN_COURS) pour un camion (vendeurId) ou
// pour le dépôt de la société (sans vendeur), saisit les quantités réellement
// comptées en voyant la quantité théorique attendue, et justifie les écarts
// (endommagé, perdu, échantillon, autre). À la validation, les quantités
// théoriques sont figées et le stock des articles comptés est remplacé par les
// quantités réelles. Les articles non comptés gardent leur quantité théorique.
export const inventairesRouter = Router();
inventairesRouter.use(requireAuth, requireAdmin, requireSociete, ciblesDeLaSociete);

const inventaireInclude = {
  vendeur: { select: { id: true, nom: true, code: true } },
  admin: { select: { id: true, nom: true, code: true } },
  lignes: { include: { article: true } },
} satisfies Prisma.InventaireInclude;

type InventaireComplet = Prisma.InventaireGetPayload<{ include: typeof inventaireInclude }>;

function serverError(res: Response, err: unknown) {
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

// Lieu inventorié : un camion (vendeurId) ou le dépôt (null).
type Lieu = { vendeurId: string | null; societeId: string };

async function stockMap(lieu: Lieu) {
  const stock = lieu.vendeurId
    ? await prisma.stockCamion.findMany({ where: { vendeurId: lieu.vendeurId }, include: { article: true } })
    : await prisma.stockDepot.findMany({ where: { article: { societeId: lieu.societeId } }, include: { article: true } });
  return new Map(stock.map((s) => [s.articleId, s]));
}

type StockMap = Awaited<ReturnType<typeof stockMap>>;

/** Quantité théorique actuelle d'un article dans le lieu inventorié. */
async function quantiteActuelle(tx: Prisma.TransactionClient, lieu: Lieu, articleId: string) {
  const stock = lieu.vendeurId
    ? await tx.stockCamion.findUnique({ where: { vendeurId_articleId: { vendeurId: lieu.vendeurId, articleId } } })
    : await tx.stockDepot.findUnique({ where: { articleId } });
  return Number(stock?.quantite ?? 0);
}

// Construit les lignes affichées : pour un inventaire en cours, la quantité
// théorique suit le stock camion en temps réel et la liste inclut aussi les
// articles du camion pas encore comptés.
function construireLignes(inv: InventaireComplet, stock: StockMap) {
  const enCours = inv.statut === "EN_COURS";
  const comptees = new Map(inv.lignes.map((l) => [l.articleId, l]));
  const lignes = inv.lignes.map((l) => {
    const theorique = enCours ? Number(stock.get(l.articleId)?.quantite ?? 0) : Number(l.quantiteTheorique ?? 0);
    const reelle = Number(l.quantiteReelle);
    return {
      articleId: l.articleId,
      article: l.article,
      quantiteTheorique: theorique,
      quantiteReelle: reelle as number | null,
      ecart: (reelle - theorique) as number | null,
      motif: l.motif,
      note: l.note,
    };
  });
  if (enCours) {
    for (const s of stock.values()) {
      if (comptees.has(s.articleId) || Number(s.quantite) === 0 || s.article.deletedAt) continue;
      lignes.push({
        articleId: s.articleId,
        article: s.article,
        quantiteTheorique: Number(s.quantite),
        quantiteReelle: null,
        ecart: null,
        motif: null,
        note: null,
      });
    }
  }
  lignes.sort((a, b) => comparerOrdreCatalogue(a.article, b.article));
  return lignes;
}

function resumer(lignes: ReturnType<typeof construireLignes>) {
  let manqueUnites = 0;
  let surplusUnites = 0;
  let valeurManque = 0;
  let nbEcarts = 0;
  let nbComptes = 0;
  for (const l of lignes) {
    if (l.quantiteReelle === null || l.ecart === null) continue;
    nbComptes++;
    if (l.ecart !== 0) nbEcarts++;
    if (l.ecart < 0) {
      manqueUnites += -l.ecart;
      valeurManque += -l.ecart * Number(l.article.prixVente);
    } else surplusUnites += l.ecart;
  }
  return { nbLignes: lignes.length, nbComptes, nbEcarts, manqueUnites, surplusUnites, valeurManque };
}

const lieuDe = (inv: { vendeurId: string | null }) => (inv.vendeurId ? "CAMION" : "DEPOT");

function serialiser(inv: InventaireComplet, lignes: ReturnType<typeof construireLignes>) {
  const { lignes: _brutes, ...entete } = inv;
  return { ...entete, lieu: lieuDe(inv), resume: resumer(lignes), lignes };
}

inventairesRouter.get("/", async (req, res) => {
  try {
    const vendeurId = req.query.vendeurId as string | undefined;
    // lieu=DEPOT : inventaires du dépôt ; lieu=CAMION : ceux des camions (d'un seul avec vendeurId).
    const lieu = req.query.lieu as string | undefined;
    const inventaires = await prisma.inventaire.findMany({
      where: {
        societeId: req.societeId,
        ...(lieu === "DEPOT" ? { vendeurId: null } : vendeurId ? { vendeurId } : lieu === "CAMION" ? { vendeurId: { not: null } } : {}),
      },
      include: inventaireInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const stocks = new Map<string, StockMap>();
    for (const inv of inventaires) {
      const cle = inv.vendeurId ?? "depot";
      if (inv.statut === "EN_COURS" && !stocks.has(cle)) {
        stocks.set(cle, await stockMap({ vendeurId: inv.vendeurId, societeId: inv.societeId }));
      }
    }
    res.json(
      inventaires.map((inv) => {
        const lignes = construireLignes(inv, stocks.get(inv.vendeurId ?? "depot") ?? new Map());
        const { lignes: _l, ...entete } = inv;
        return { ...entete, lieu: lieuDe(inv), resume: resumer(lignes) };
      })
    );
  } catch (err) {
    serverError(res, err);
  }
});

inventairesRouter.get("/:id", async (req, res) => {
  try {
    const inv = await prisma.inventaire.findFirst({
      where: { id: req.params.id, societeId: req.societeId },
      include: inventaireInclude,
    });
    if (!inv) return res.status(404).json({ error: "Inventaire introuvable" });
    const stock = inv.statut === "EN_COURS" ? await stockMap({ vendeurId: inv.vendeurId, societeId: inv.societeId }) : new Map();
    res.json(serialiser(inv, construireLignes(inv, stock)));
  } catch (err) {
    serverError(res, err);
  }
});

// vendeurId = camion de ce vendeur ; lieu "DEPOT" (sans vendeur) = dépôt de la société.
const creerSchema = z.object({
  vendeurId: z.string().uuid().optional(),
  lieu: z.enum(["DEPOT", "CAMION"]).optional(),
  note: z.string().max(500).optional(),
});

// Un seul inventaire en cours par camion (et un pour le dépôt) : on reprend celui qui existe.
inventairesRouter.post("/", async (req, res) => {
  const parsed = creerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const vendeurId = parsed.data.lieu === "DEPOT" ? null : parsed.data.vendeurId ?? null;
  if (parsed.data.lieu !== "DEPOT" && !vendeurId) return res.status(400).json({ error: "Camion à inventorier requis" });
  try {
    const existant = await prisma.inventaire.findFirst({
      where: { societeId: req.societeId!, vendeurId, statut: "EN_COURS" },
    });
    if (existant) return res.status(200).json(existant);
    const inv = await prisma.inventaire.create({
      data: { societeId: req.societeId!, vendeurId, adminId: req.user!.id, note: parsed.data.note },
    });
    res.status(201).json(inv);
  } catch (err) {
    serverError(res, err);
  }
});

async function inventaireEnCours(id: string, res: Response, societeId: string) {
  const inv = await prisma.inventaire.findFirst({ where: { id, societeId } });
  if (!inv) {
    res.status(404).json({ error: "Inventaire introuvable" });
    return null;
  }
  if (inv.statut !== "EN_COURS") {
    res.status(409).json({ error: "Cet inventaire est déjà validé" });
    return null;
  }
  return inv;
}

const ligneSchema = z.object({
  quantiteReelle: z.number().min(0),
  motif: z.enum(["ENDOMMAGE", "PERDU", "ECHANTILLON", "AUTRE"]).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

inventairesRouter.put("/:id/lignes/:articleId", async (req, res) => {
  const parsed = ligneSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const inv = await inventaireEnCours(req.params.id, res, req.societeId!);
    if (!inv) return;
    const article = await prisma.article.findFirst({ where: { id: req.params.articleId, societeId: req.societeId }, select: { id: true } });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    // Surplus (compté au-delà du stock théorique) : pas de motif, seulement une note.
    const surplus = parsed.data.quantiteReelle > (await quantiteActuelle(prisma, inv, req.params.articleId));
    const data = {
      quantiteReelle: parsed.data.quantiteReelle,
      motif: surplus ? null : parsed.data.motif ?? null,
      note: parsed.data.note?.trim() || null,
    };
    const ligne = await prisma.ligneInventaire.upsert({
      where: { inventaireId_articleId: { inventaireId: inv.id, articleId: req.params.articleId } },
      create: { inventaireId: inv.id, articleId: req.params.articleId, ...data },
      update: data,
    });
    res.json(ligne);
  } catch (err) {
    serverError(res, err);
  }
});

inventairesRouter.delete("/:id/lignes/:articleId", async (req, res) => {
  try {
    const inv = await inventaireEnCours(req.params.id, res, req.societeId!);
    if (!inv) return;
    await prisma.ligneInventaire.deleteMany({ where: { inventaireId: inv.id, articleId: req.params.articleId } });
    res.status(204).send();
  } catch (err) {
    serverError(res, err);
  }
});

// Validation : fige les quantités théoriques et remplace le stock (camion ou
// dépôt) des articles comptés par les quantités réelles.
inventairesRouter.post("/:id/valider", async (req, res) => {
  try {
    const inv = await inventaireEnCours(req.params.id, res, req.societeId!);
    if (!inv) return;
    const lignes = await prisma.ligneInventaire.findMany({ where: { inventaireId: inv.id } });
    if (lignes.length === 0) {
      return res.status(400).json({ error: "Comptez au moins un article avant de valider" });
    }
    const dateValidation = new Date();
    const reference = `Inventaire du ${dateValidation.toLocaleDateString("fr-FR")}`;

    await prisma.$transaction(async (tx) => {
      for (const l of lignes) {
        const theorique = await quantiteActuelle(tx, inv, l.articleId);
        const reelle = Number(l.quantiteReelle);
        const ecart = reelle - theorique;

        await tx.ligneInventaire.update({
          where: { id: l.id },
          // Un motif ne justifie qu'un manque : aucun pour un comptage conforme ou un surplus.
          data: { quantiteTheorique: theorique, ...(ecart >= 0 ? { motif: null } : {}) },
        });
        if (inv.vendeurId) {
          await tx.stockCamion.upsert({
            where: { vendeurId_articleId: { vendeurId: inv.vendeurId, articleId: l.articleId } },
            create: { vendeurId: inv.vendeurId, articleId: l.articleId, quantite: reelle },
            update: { quantite: reelle },
          });
          if (ecart !== 0) {
            await tx.mouvementStock.create({
              data: { vendeurId: inv.vendeurId, articleId: l.articleId, sens: "AJUSTEMENT", quantite: ecart, reference },
            });
          }
        } else {
          await tx.stockDepot.upsert({
            where: { articleId: l.articleId },
            create: { articleId: l.articleId, quantite: reelle },
            update: { quantite: reelle },
          });
          await synchroniserLots(tx, l.articleId);
          if (ecart !== 0) {
            await tx.mouvementDepot.create({
              data: { articleId: l.articleId, sens: "AJUSTEMENT", quantite: ecart, reference },
            });
          }
        }
      }
      await tx.inventaire.update({ where: { id: inv.id }, data: { statut: "VALIDE", dateValidation } });
    });

    const complet = await prisma.inventaire.findUniqueOrThrow({ where: { id: inv.id }, include: inventaireInclude });
    res.json(serialiser(complet, construireLignes(complet, new Map())));
  } catch (err) {
    serverError(res, err);
  }
});

// Abandon d'un inventaire en cours (aucun effet sur le stock).
inventairesRouter.delete("/:id", async (req, res) => {
  try {
    const inv = await inventaireEnCours(req.params.id, res, req.societeId!);
    if (!inv) return;
    await prisma.inventaire.delete({ where: { id: inv.id } });
    res.status(204).send();
  } catch (err) {
    serverError(res, err);
  }
});
