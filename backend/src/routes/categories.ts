import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { cleCategorie } from "../lib/categories";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Arbre de catégories de la société : catégorie › sous-catégorie. Lecture pour tous
// (le vendeur filtre ses articles par catégorie), écriture réservée à l'admin.
//
// Le modèle est un arbre (parentId) : passer à trois niveaux se fait en changeant
// NIVEAUX_MAX, sans migration.
export const categoriesRouter = Router();
categoriesRouter.use(requireAuth, requireSociete);

const NIVEAUX_MAX = 2;
const nomSchema = z.string().trim().min(1, "Nom requis").max(60, "60 caractères maximum");

/** Profondeur d'un nœud (1 = catégorie principale). */
async function niveau(id: string | null): Promise<number> {
  let n = 0;
  let courant = id;
  while (courant && n < 10) {
    const c = await prisma.categorie.findUnique({ where: { id: courant }, select: { parentId: true } });
    if (!c) break;
    n++;
    courant = c.parentId;
  }
  return n;
}

/** Y a-t-il déjà une catégorie de ce nom (sans accents ni majuscules) parmi les frères ? */
async function nomPris(societeId: string, parentId: string | null, nom: string, sauf?: string) {
  const freres = await prisma.categorie.findMany({ where: { societeId, parentId }, select: { id: true, nom: true } });
  return freres.some((f) => f.id !== sauf && cleCategorie(f.nom) === cleCategorie(nom));
}

categoriesRouter.get("/", async (req, res) => {
  const [categories, comptes] = await Promise.all([
    prisma.categorie.findMany({ where: { societeId: req.societeId }, orderBy: [{ ordre: "asc" }, { nom: "asc" }] }),
    prisma.article.groupBy({
      by: ["categorieId"],
      where: { societeId: req.societeId, deletedAt: null, categorieId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const nb = new Map(comptes.map((c) => [c.categorieId, c._count._all]));
  res.json(
    categories.map((c) => ({
      id: c.id,
      nom: c.nom,
      parentId: c.parentId,
      ordre: c.ordre,
      nbArticles: nb.get(c.id) ?? 0,
      perissable: c.perissable,
      alerteJours: c.alerteJours,
    })),
  );
});

const creerSchema = z.object({ nom: nomSchema, parentId: z.string().uuid().nullish() });

categoriesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = creerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  const { nom } = parsed.data;
  const parentId = parsed.data.parentId ?? null;
  try {
    if (parentId) {
      const parent = await prisma.categorie.findFirst({ where: { id: parentId, societeId: req.societeId }, select: { id: true } });
      if (!parent) return res.status(404).json({ error: "Catégorie parente introuvable" });
      if ((await niveau(parentId)) >= NIVEAUX_MAX) return res.status(400).json({ error: `${NIVEAUX_MAX} niveaux au maximum` });
    }
    if (await nomPris(req.societeId!, parentId, nom)) return res.status(409).json({ error: "Ce nom existe déjà à cet endroit" });
    const { _max } = await prisma.categorie.aggregate({ where: { societeId: req.societeId, parentId }, _max: { ordre: true } });
    const creee = await prisma.categorie.create({
      data: { societeId: req.societeId!, nom, parentId, ordre: (_max.ordre ?? 0) + 1 },
    });
    res.status(201).json({ id: creee.id, nom: creee.nom, parentId: creee.parentId, ordre: creee.ordre, nbArticles: 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const modifierSchema = z.object({
  nom: nomSchema.optional(),
  parentId: z.string().uuid().nullable().optional(),
  ordre: z.number().int().optional(),
  // Suivi des dates d'expiration ; alerteJours : délai d'alerte (null = 30 jours).
  perissable: z.boolean().optional(),
  alerteJours: z.number().int().min(1).max(730).nullable().optional(),
});

categoriesRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = modifierSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  try {
    const cat = await prisma.categorie.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
    if (!cat) return res.status(404).json({ error: "Catégorie introuvable" });
    const nom = parsed.data.nom ?? cat.nom;
    const parentId = parsed.data.parentId === undefined ? cat.parentId : parsed.data.parentId;

    if (parentId !== cat.parentId && parentId) {
      if (parentId === cat.id) return res.status(400).json({ error: "Une catégorie ne peut pas être dans elle-même" });
      const parent = await prisma.categorie.findFirst({ where: { id: parentId, societeId: req.societeId }, select: { id: true } });
      if (!parent) return res.status(404).json({ error: "Catégorie parente introuvable" });
      const enfants = await prisma.categorie.count({ where: { parentId: cat.id } });
      if ((await niveau(parentId)) + 1 + (enfants > 0 ? 1 : 0) > NIVEAUX_MAX) {
        return res.status(400).json({ error: `${NIVEAUX_MAX} niveaux au maximum` });
      }
    }
    if ((nom !== cat.nom || parentId !== cat.parentId) && (await nomPris(req.societeId!, parentId, nom, cat.id))) {
      return res.status(409).json({ error: "Ce nom existe déjà à cet endroit" });
    }
    const { ordre, perissable, alerteJours } = parsed.data;
    const maj = await prisma.categorie.update({
      where: { id: cat.id },
      data: {
        nom,
        parentId,
        ...(ordre !== undefined ? { ordre } : {}),
        ...(perissable !== undefined ? { perissable } : {}),
        ...(alerteJours !== undefined ? { alerteJours } : {}),
      },
    });
    res.json({ id: maj.id, nom: maj.nom, parentId: maj.parentId, ordre: maj.ordre, perissable: maj.perissable, alerteJours: maj.alerteJours });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

categoriesRouter.delete("/:id", requireAdmin, async (req, res) => {
  try {
    const cat = await prisma.categorie.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
    if (!cat) return res.status(404).json({ error: "Catégorie introuvable" });
    const [enfants, articles] = await Promise.all([
      prisma.categorie.count({ where: { parentId: cat.id } }),
      prisma.article.count({ where: { categorieId: cat.id, deletedAt: null } }),
    ]);
    if (enfants > 0) return res.status(409).json({ error: "Cette catégorie contient des sous-catégories : supprimez-les ou déplacez-les d'abord." });
    if (articles > 0) return res.status(409).json({ error: `Cette catégorie contient ${articles} article${articles > 1 ? "s" : ""} : classez-les ailleurs d'abord.` });
    await prisma.categorie.delete({ where: { id: cat.id } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const classerSchema = z.object({
  articleIds: z.array(z.string().uuid()).min(1).max(5000),
  // null = retirer les articles de leur catégorie.
  categorieId: z.string().uuid().nullable(),
});

// Classe des articles dans une catégorie (classement groupé, depuis « À compléter »).
categoriesRouter.post("/classer", requireAdmin, async (req, res) => {
  const parsed = classerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Données invalides" });
  try {
    if (parsed.data.categorieId) {
      const cat = await prisma.categorie.findFirst({ where: { id: parsed.data.categorieId, societeId: req.societeId }, select: { id: true } });
      if (!cat) return res.status(404).json({ error: "Catégorie introuvable" });
    }
    const { count } = await prisma.article.updateMany({
      where: { id: { in: parsed.data.articleIds }, societeId: req.societeId, deletedAt: null },
      data: { categorieId: parsed.data.categorieId },
    });
    res.json({ classes: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
