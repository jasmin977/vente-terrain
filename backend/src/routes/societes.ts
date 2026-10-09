import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";

// Sociétés gérées par l'admin. Chacune a ses articles, clients, dépôt, vendeurs
// et bons ; l'app envoie la société choisie dans l'en-tête X-Societe-Id.
export const societesRouter = Router();
societesRouter.use(requireAuth, requireAdmin);

const optionnel = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const societeSchema = z.object({
  nom: z.string().trim().min(1, "Nom requis").max(120),
  // Préfixe des codes vendeurs (RC → RC-V001) : 2 à 6 lettres ou chiffres.
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,6}$/, "Code : 2 à 6 lettres ou chiffres (ex. RC)"),
  activite: optionnel,
  matriculeFiscal: optionnel,
  adresse: optionnel,
  telephone: optionnel,
  logo: optionnel,
});

const premiereErreur = (err: z.ZodError) => err.issues[0]?.message ?? "Données invalides";

// Nombre d'articles et de vendeurs : une société vide ouvre sur le démarrage guidé.
const avecCompteurs = {
  _count: {
    select: {
      articles: { where: { deletedAt: null } },
      users: { where: { role: "VENDEUR" as const } },
      clients: { where: { deletedAt: null } },
    },
  },
} satisfies Prisma.SocieteInclude;

societesRouter.get("/", async (_req, res) => {
  const societes = await prisma.societe.findMany({ where: { deletedAt: null }, include: avecCompteurs, orderBy: { nom: "asc" } });
  res.json(societes);
});

societesRouter.get("/:id", async (req, res) => {
  const societe = await prisma.societe.findFirst({ where: { id: req.params.id, deletedAt: null }, include: avecCompteurs });
  if (!societe) return res.status(404).json({ error: "Société introuvable" });
  res.json(societe);
});

const codePris = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

societesRouter.post("/", async (req, res) => {
  const parsed = societeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  try {
    const societe = await prisma.societe.create({ data: parsed.data, include: avecCompteurs });
    res.status(201).json(societe);
  } catch (err) {
    if (codePris(err)) return res.status(409).json({ error: "Ce code est déjà utilisé par une autre société" });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

societesRouter.put("/:id", async (req, res) => {
  const parsed = societeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  try {
    const maj = await prisma.societe.updateMany({ where: { id: req.params.id, deletedAt: null }, data: parsed.data });
    if (maj.count === 0) return res.status(404).json({ error: "Société introuvable" });
    res.json(await prisma.societe.findUnique({ where: { id: req.params.id }, include: avecCompteurs }));
  } catch (err) {
    if (codePris(err)) return res.status(409).json({ error: "Ce code est déjà utilisé par une autre société" });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Suppression d'une société vide uniquement (créée par erreur) : une société
// qui a des articles, clients ou vendeurs garde tout son historique.
societesRouter.delete("/:id", async (req, res) => {
  try {
    const societe = await prisma.societe.findFirst({ where: { id: req.params.id, deletedAt: null }, include: avecCompteurs });
    if (!societe) return res.status(404).json({ error: "Société introuvable" });
    const { articles, users, clients } = societe._count;
    if (articles + users + clients > 0) {
      return res.status(409).json({ error: "Cette société a déjà des articles, clients ou vendeurs : elle ne peut pas être supprimée" });
    }
    await prisma.societe.update({ where: { id: societe.id }, data: { deletedAt: new Date() } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
