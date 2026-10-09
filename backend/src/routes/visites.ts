import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ciblesDeLaSociete, requireAuth, requireSociete } from "../middleware/auth";

export const visitesRouter = Router();
visitesRouter.use(requireAuth, requireSociete, ciblesDeLaSociete);

const visiteSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  latitude: z.number(),
  longitude: z.number(),
  date: z.coerce.date().optional(),
});

// Module 9 - Géolocalisation : point de passage enregistré indépendamment d'une facture
visitesRouter.post("/", async (req, res) => {
  const parsed = visiteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  if (data.clientId) {
    const c = await prisma.client.findFirst({ where: { id: data.clientId, societeId: req.societeId }, select: { id: true } });
    if (!c) return res.status(404).json({ error: "Client introuvable" });
  }
  const visite = await prisma.visite.create({
    data: { ...data, vendeurId: req.user!.id, date: data.date ?? new Date() },
  });
  res.status(201).json(visite);
});

// Parcours journalier d'un vendeur, pour la carte des visites côté admin
visitesRouter.get("/", async (req, res) => {
  const { vendeurId, date } = req.query as Record<string, string | undefined>;
  const day = date ? new Date(date) : new Date();
  const start = new Date(day.setHours(0, 0, 0, 0));
  const end = new Date(day.setHours(23, 59, 59, 999));

  const visites = await prisma.visite.findMany({
    where: {
      vendeur: { societeId: req.societeId },
      ...(vendeurId ? { vendeurId } : {}),
      date: { gte: start, lte: end },
    },
    include: { client: true },
    orderBy: { date: "asc" },
  });
  res.json(visites);
});
