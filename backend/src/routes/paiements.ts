import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";

export const paiementsRouter = Router();
paiementsRouter.use(requireAuth);

const paiementSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  factureId: z.string().uuid().optional(),
  montant: z.number().positive(),
  mode: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TPE"]),
  reference: z.string().optional(),
  date: z.coerce.date().optional(),
});

// Module 5 - Encaissement
paiementsRouter.post("/", async (req, res) => {
  const parsed = paiementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;

  if (data.id) {
    const existing = await prisma.paiement.findUnique({ where: { id: data.id } });
    if (existing) return res.status(200).json(existing);
  }

  const paiement = await prisma.paiement.create({
    data: { ...data, vendeurId: req.user!.id, date: data.date ?? new Date() },
  });
  res.status(201).json(paiement);
});

paiementsRouter.get("/", async (req, res) => {
  const { clientId, vendeurId } = req.query as Record<string, string | undefined>;
  const paiements = await prisma.paiement.findMany({
    where: { deletedAt: null, ...(clientId ? { clientId } : {}), ...(vendeurId ? { vendeurId } : {}) },
    orderBy: { date: "desc" },
    take: 500,
  });
  res.json(paiements);
});
