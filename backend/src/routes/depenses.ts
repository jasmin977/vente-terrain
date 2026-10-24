import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { arrondi } from "../services/achatService";

/** Dépenses de fonctionnement (réparation, outillage, carburant, loyer…), payées tout de suite, et leurs catégories. */
export const depensesRouter = Router();
depensesRouter.use(requireAuth, requireSociete, requireAdmin);

/** Catégories proposées à la première utilisation ; l'admin les renomme, en ajoute ou en retire. */
const CATEGORIES_PAR_DEFAUT = [
  "Réparation / entretien",
  "Outillage / matériel",
  "Carburant",
  "Loyer",
  "Électricité / eau",
  "Téléphone / internet",
  "Transport",
  "Fournitures de bureau",
  "Salaires",
  "Autre",
];

async function categoriesDe(societeId: string) {
  const existantes = await prisma.categorieDepense.count({ where: { societeId } });
  if (existantes === 0) {
    await prisma.categorieDepense.createMany({ data: CATEGORIES_PAR_DEFAUT.map((nom, ordre) => ({ societeId, nom, ordre })) });
  }
  return prisma.categorieDepense.findMany({ where: { societeId, deletedAt: null }, orderBy: [{ ordre: "asc" }, { nom: "asc" }] });
}

/* ---------- Catégories ---------- */

depensesRouter.get("/categories", async (req, res) => {
  res.json(await categoriesDe(req.societeId!));
});

const categorieSchema = z.object({ nom: z.string().trim().min(1).max(80) });

depensesRouter.post("/categories", async (req, res) => {
  const parsed = categorieSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const dernier = await prisma.categorieDepense.aggregate({ where: { societeId: req.societeId }, _max: { ordre: true } });
  const c = await prisma.categorieDepense.create({ data: { societeId: req.societeId!, nom: parsed.data.nom, ordre: (dernier._max.ordre ?? 0) + 1 } });
  res.status(201).json(c);
});

depensesRouter.put("/categories/:id", async (req, res) => {
  const parsed = categorieSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const maj = await prisma.categorieDepense.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: { nom: parsed.data.nom } });
  if (maj.count === 0) return res.status(404).json({ error: "Catégorie introuvable" });
  res.json(await prisma.categorieDepense.findUnique({ where: { id: req.params.id } }));
});

// Suppression logique : les dépenses déjà saisies gardent leur catégorie.
depensesRouter.delete("/categories/:id", async (req, res) => {
  await prisma.categorieDepense.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

/* ---------- Dépenses ---------- */

const INCLUDE = {
  categorie: { select: { id: true, nom: true } },
  fournisseur: { select: { id: true, nom: true, ref: true, divers: true } },
  vendeur: { select: { id: true, nom: true, code: true } },
} as const;

depensesRouter.get("/", async (req, res) => {
  const { dateFrom, dateTo, categorieId, mode, vendeurId } = req.query as Record<string, string | undefined>;
  const depenses = await prisma.depense.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(categorieId ? { categorieId } : {}),
      ...(mode ? { mode: mode as "ESPECES" | "CHEQUE" | "VIREMENT" | "TRAITE" } : {}),
      ...(vendeurId ? { vendeurId } : {}),
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
    },
    include: INCLUDE,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 2000,
  });
  res.json(depenses);
});

const depenseSchema = z.object({
  date: z.coerce.date(),
  categorieId: z.string().uuid(),
  montant: z.number().positive(),
  mode: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"]),
  reference: z.string().trim().max(120).optional().nullable(),
  description: z.string().trim().min(1).max(300),
  fournisseurId: z.string().uuid().optional().nullable(),
  beneficiaire: z.string().trim().max(160).optional().nullable(),
  vendeurId: z.string().uuid().optional().nullable(),
  photo: z.string().url().max(500).optional().nullable(),
});

/** Vérifie que la catégorie, le fournisseur et le vendeur appartiennent bien à la société. */
async function verifier(societeId: string, d: Partial<z.infer<typeof depenseSchema>>) {
  if (d.categorieId && !(await prisma.categorieDepense.findFirst({ where: { id: d.categorieId, societeId }, select: { id: true } }))) return "Catégorie introuvable";
  if (d.fournisseurId && !(await prisma.fournisseur.findFirst({ where: { id: d.fournisseurId, societeId }, select: { id: true } }))) return "Fournisseur introuvable";
  if (d.vendeurId && !(await prisma.user.findFirst({ where: { id: d.vendeurId, societeId }, select: { id: true } }))) return "Vendeur introuvable";
  if (d.mode === "TRAITE" && !d.reference?.trim()) return "Le numéro de la traite est obligatoire";
  return null;
}

const nettoyer = (d: Partial<z.infer<typeof depenseSchema>>) => ({
  ...d,
  ...(d.montant !== undefined ? { montant: arrondi(d.montant) } : {}),
  ...(d.reference !== undefined ? { reference: d.reference || null } : {}),
  ...(d.beneficiaire !== undefined ? { beneficiaire: d.beneficiaire || null } : {}),
});

depensesRouter.post("/", async (req, res) => {
  const parsed = depenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const erreur = await verifier(req.societeId!, parsed.data);
  if (erreur) return res.status(400).json({ error: erreur });
  const d = await prisma.depense.create({ data: { ...nettoyer(parsed.data), societeId: req.societeId! } as never, include: INCLUDE });
  res.status(201).json(d);
});

depensesRouter.put("/:id", async (req, res) => {
  const parsed = depenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const erreur = await verifier(req.societeId!, parsed.data);
  if (erreur) return res.status(400).json({ error: erreur });
  const maj = await prisma.depense.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: nettoyer(parsed.data) as never });
  if (maj.count === 0) return res.status(404).json({ error: "Dépense introuvable" });
  res.json(await prisma.depense.findUnique({ where: { id: req.params.id }, include: INCLUDE }));
});

depensesRouter.delete("/:id", async (req, res) => {
  await prisma.depense.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
