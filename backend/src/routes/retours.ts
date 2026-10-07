import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const retoursRouter = Router();
retoursRouter.use(requireAuth);

const ligneSchema = z.object({
  articleId: z.string().uuid(),
  quantite: z.number().positive(),
  montant: z.number().nonnegative(),
});

const retourSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  motif: z.string().optional(),
  lignes: z.array(ligneSchema).min(1),
});

// Module 2/6 - Retour d'un client (produit repris) : réintègre le stock camion du vendeur
retoursRouter.post("/", async (req, res) => {
  const parsed = retourSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const vendeurId = req.user!.id;

  const retour = await prisma.$transaction(async (tx) => {
    const client = await tx.client.findUnique({ where: { id: data.clientId }, select: { nomCommerce: true } });
    for (const l of data.lignes) {
      await tx.stockCamion.upsert({
        where: { vendeurId_articleId: { vendeurId, articleId: l.articleId } },
        create: { vendeurId, articleId: l.articleId, quantite: l.quantite },
        update: { quantite: { increment: l.quantite } },
      });
      await tx.mouvementStock.create({
        data: { vendeurId, articleId: l.articleId, sens: "RETOUR_CLIENT", quantite: l.quantite, reference: client?.nomCommerce },
      });
    }
    return tx.retour.create({
      data: {
        id: data.id,
        clientId: data.clientId,
        vendeurId,
        motif: data.motif,
        lignes: { create: data.lignes },
      },
      include: { lignes: true },
    });
  });

  res.status(201).json(retour);
});

retoursRouter.get("/", async (req, res) => {
  const { clientId } = req.query as Record<string, string | undefined>;
  const retours = await prisma.retour.findMany({
    where: { deletedAt: null, ...(clientId ? { clientId } : {}) },
    include: { lignes: { include: { article: true } } },
    orderBy: { date: "desc" },
  });
  res.json(retours);
});
