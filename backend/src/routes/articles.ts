import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";

export const articlesRouter = Router();
articlesRouter.use(requireAuth);

// Module 1 - Gestion des Articles : recherche sur désignation, marque, unité,
// code et code-barres. Chaque mot saisi doit se retrouver dans l'un de ces
// champs (« cire orange » trouve « CIRE-WAX ORANGE »).
const CHAMPS_RECHERCHE = ["designation", "marque", "unit", "code", "codeBarre"] as const;
articlesRouter.get("/", async (req, res) => {
  const { q, codeBarre } = req.query as Record<string, string | undefined>;

  const articles = await prisma.article.findMany({
    where: {
      deletedAt: null,
      ...(codeBarre ? { codeBarre } : {}),
      ...(q?.trim()
        ? {
            AND: q
              .trim()
              .split(/\s+/)
              .map((mot) => ({
                OR: CHAMPS_RECHERCHE.map((champ) => ({ [champ]: { contains: mot, mode: "insensitive" as const } })),
              })),
          }
        : {}),
    },
    orderBy: { designation: "asc" },
    take: 200,
  });
  res.json(articles);
});

articlesRouter.get("/:id", async (req, res) => {
  const article = await prisma.article.findUnique({ where: { id: req.params.id } });
  if (!article) return res.status(404).json({ error: "Article introuvable" });
  res.json(article);
});

const articleSchema = z.object({
  code: z.string().min(1),
  codeBarre: z.string().optional(),
  designation: z.string().min(1),
  marque: z.string().optional(),
  unit: z.string().optional(),
  img: z.string().optional(),
  prixAchat: z.number().nonnegative(),
  prixVente: z.number().nonnegative(),
  colisage: z.number().int().positive().default(1),
  tva: z.number().min(0).max(100).default(19),
});

articlesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = articleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const article = await prisma.article.create({ data: parsed.data });
  res.status(201).json(article);
});

articlesRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = articleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const article = await prisma.article.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(article);
});

articlesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.article.update({ where: { id: req.params.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
