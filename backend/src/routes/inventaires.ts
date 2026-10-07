import { Router, type Response } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";

// Inventaires du stock camion — réservés à l'admin.
//
// Cycle : l'admin ouvre un inventaire (EN_COURS) pour un vendeur, saisit les
// quantités réellement comptées en voyant la quantité théorique attendue, et
// justifie les écarts (endommagé, perdu, échantillon, autre). À la validation,
// les quantités théoriques sont figées et le stock camion des articles comptés
// est remplacé par les quantités réelles. Les articles non comptés gardent leur
// quantité théorique.
export const inventairesRouter = Router();
inventairesRouter.use(requireAuth, requireAdmin);

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

async function stockCamionMap(vendeurId: string) {
  const stock = await prisma.stockCamion.findMany({ where: { vendeurId }, include: { article: true } });
  return new Map(stock.map((s) => [s.articleId, s]));
}

// Construit les lignes affichées : pour un inventaire en cours, la quantité
// théorique suit le stock camion en temps réel et la liste inclut aussi les
// articles du camion pas encore comptés.
function construireLignes(inv: InventaireComplet, stock: Awaited<ReturnType<typeof stockCamionMap>>) {
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
  lignes.sort((a, b) => a.article.designation.localeCompare(b.article.designation, "fr"));
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

function serialiser(inv: InventaireComplet, lignes: ReturnType<typeof construireLignes>) {
  const { lignes: _brutes, ...entete } = inv;
  return { ...entete, resume: resumer(lignes), lignes };
}

inventairesRouter.get("/", async (req, res) => {
  try {
    const vendeurId = req.query.vendeurId as string | undefined;
    const inventaires = await prisma.inventaire.findMany({
      where: vendeurId ? { vendeurId } : {},
      include: inventaireInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const stocks = new Map<string, Awaited<ReturnType<typeof stockCamionMap>>>();
    for (const inv of inventaires) {
      if (inv.statut === "EN_COURS" && !stocks.has(inv.vendeurId)) {
        stocks.set(inv.vendeurId, await stockCamionMap(inv.vendeurId));
      }
    }
    res.json(
      inventaires.map((inv) => {
        const lignes = construireLignes(inv, stocks.get(inv.vendeurId) ?? new Map());
        const { lignes: _l, ...entete } = inv;
        return { ...entete, resume: resumer(lignes) };
      })
    );
  } catch (err) {
    serverError(res, err);
  }
});

inventairesRouter.get("/:id", async (req, res) => {
  try {
    const inv = await prisma.inventaire.findUnique({ where: { id: req.params.id }, include: inventaireInclude });
    if (!inv) return res.status(404).json({ error: "Inventaire introuvable" });
    const stock = inv.statut === "EN_COURS" ? await stockCamionMap(inv.vendeurId) : new Map();
    res.json(serialiser(inv, construireLignes(inv, stock)));
  } catch (err) {
    serverError(res, err);
  }
});

const creerSchema = z.object({ vendeurId: z.string().uuid(), note: z.string().max(500).optional() });

// Un seul inventaire en cours par camion : on reprend celui qui existe.
inventairesRouter.post("/", async (req, res) => {
  const parsed = creerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const existant = await prisma.inventaire.findFirst({
      where: { vendeurId: parsed.data.vendeurId, statut: "EN_COURS" },
    });
    if (existant) return res.status(200).json(existant);
    const inv = await prisma.inventaire.create({
      data: { vendeurId: parsed.data.vendeurId, adminId: req.user!.id, note: parsed.data.note },
    });
    res.status(201).json(inv);
  } catch (err) {
    serverError(res, err);
  }
});

async function inventaireEnCours(id: string, res: Response) {
  const inv = await prisma.inventaire.findUnique({ where: { id } });
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
    const inv = await inventaireEnCours(req.params.id, res);
    if (!inv) return;
    // Surplus (compté au-delà du stock camion) : pas de motif, seulement une note.
    const stock = await prisma.stockCamion.findUnique({
      where: { vendeurId_articleId: { vendeurId: inv.vendeurId, articleId: req.params.articleId } },
    });
    const surplus = parsed.data.quantiteReelle > Number(stock?.quantite ?? 0);
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
    const inv = await inventaireEnCours(req.params.id, res);
    if (!inv) return;
    await prisma.ligneInventaire.deleteMany({ where: { inventaireId: inv.id, articleId: req.params.articleId } });
    res.status(204).send();
  } catch (err) {
    serverError(res, err);
  }
});

// Validation : fige les quantités théoriques et remplace le stock camion des
// articles comptés par les quantités réelles.
inventairesRouter.post("/:id/valider", async (req, res) => {
  try {
    const inv = await inventaireEnCours(req.params.id, res);
    if (!inv) return;
    const lignes = await prisma.ligneInventaire.findMany({ where: { inventaireId: inv.id } });
    if (lignes.length === 0) {
      return res.status(400).json({ error: "Comptez au moins un article avant de valider" });
    }
    const dateValidation = new Date();
    const reference = `Inventaire du ${dateValidation.toLocaleDateString("fr-FR")}`;

    await prisma.$transaction(async (tx) => {
      for (const l of lignes) {
        const stock = await tx.stockCamion.findUnique({
          where: { vendeurId_articleId: { vendeurId: inv.vendeurId, articleId: l.articleId } },
        });
        const theorique = Number(stock?.quantite ?? 0);
        const reelle = Number(l.quantiteReelle);
        const ecart = reelle - theorique;

        await tx.ligneInventaire.update({
          where: { id: l.id },
          // Un motif ne justifie qu'un manque : aucun pour un comptage conforme ou un surplus.
          data: { quantiteTheorique: theorique, ...(ecart >= 0 ? { motif: null } : {}) },
        });
        await tx.stockCamion.upsert({
          where: { vendeurId_articleId: { vendeurId: inv.vendeurId, articleId: l.articleId } },
          create: { vendeurId: inv.vendeurId, articleId: l.articleId, quantite: reelle },
          update: { quantite: reelle },
        });
        if (ecart !== 0) {
          await tx.mouvementStock.create({
            data: {
              vendeurId: inv.vendeurId,
              articleId: l.articleId,
              sens: "AJUSTEMENT",
              quantite: ecart,
              reference,
            },
          });
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
    const inv = await inventaireEnCours(req.params.id, res);
    if (!inv) return;
    await prisma.inventaire.delete({ where: { id: inv.id } });
    res.status(204).send();
  } catch (err) {
    serverError(res, err);
  }
});
