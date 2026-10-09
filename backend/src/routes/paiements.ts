import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ciblesDeLaSociete, requireAuth, requireSociete } from "../middleware/auth";

export const paiementsRouter = Router();
paiementsRouter.use(requireAuth, requireSociete, ciblesDeLaSociete);

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

  const client = await prisma.client.findFirst({ where: { id: data.clientId, societeId: req.societeId }, select: { id: true } });
  if (!client) return res.status(404).json({ error: "Client introuvable" });
  if (data.factureId) {
    const f = await prisma.facture.findFirst({ where: { id: data.factureId, clientId: data.clientId }, select: { id: true } });
    if (!f) return res.status(404).json({ error: "Bon de livraison introuvable" });
  }
  const paiement = await prisma.paiement.create({
    data: { ...data, vendeurId: req.user!.id, date: data.date ?? new Date() },
  });
  res.status(201).json(paiement);
});

paiementsRouter.get("/", async (req, res) => {
  const { clientId, vendeurId } = req.query as Record<string, string | undefined>;
  const paiements = await prisma.paiement.findMany({
    where: { deletedAt: null, client: { societeId: req.societeId }, ...(clientId ? { clientId } : {}), ...(vendeurId ? { vendeurId } : {}) },
    orderBy: { date: "desc" },
    take: 500,
  });
  res.json(paiements);
});
