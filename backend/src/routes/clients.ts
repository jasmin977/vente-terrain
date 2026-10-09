import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSociete } from "../middleware/auth";
import { calculerSolde, reglementsFactures, situationsClients } from "../services/creditService";

export const clientsRouter = Router();
clientsRouter.use(requireAuth, requireSociete);

// Module 2 - Gestion Clients
clientsRouter.get("/", async (req, res) => {
  const { q } = req.query as Record<string, string | undefined>;
  const clients = await prisma.client.findMany({
    where: {
      societeId: req.societeId,
      actif: true,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { code: { contains: q, mode: "insensitive" } },
              { nomCommerce: { contains: q, mode: "insensitive" } },
              { ville: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { nomCommerce: "asc" },
    take: 1000,
  });

  // Solde = reste dû sur les factures à crédit (voir services/creditService).
  const situations = await situationsClients(clients.map((c) => c.id));
  res.json(clients.map((client) => ({ ...client, solde: situations.get(client.id)?.totalDu ?? 0 })));
});


clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
  if (!client) return res.status(404).json({ error: "Client introuvable" });
  res.json({ ...client, solde: await calculerSolde(client.id) });
});

// Historique complet : factures, retours, paiements (Module 2)
clientsRouter.get("/:id/historique", async (req, res) => {
  const clientId = req.params.id;
  const client = await prisma.client.findFirst({ where: { id: clientId, societeId: req.societeId }, select: { id: true } });
  if (!client) return res.status(404).json({ error: "Client introuvable" });
  const [factures, retours, paiements] = await Promise.all([
    prisma.facture.findMany({
      where: { clientId, deletedAt: null },
      include: { lignes: { include: { article: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.retour.findMany({
      where: { clientId, deletedAt: null },
      include: { lignes: { include: { article: true } } },
      orderBy: { date: "desc" },
    }),
    prisma.paiement.findMany({
      where: { clientId, deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);
  const reglements = await reglementsFactures(factures);
  res.json({
    factures: factures.map((f) => ({ ...f, reglement: reglements.get(f.id) ?? null })),
    retours,
    paiements,
    solde: await calculerSolde(clientId),
  });
});

const clientSchema = z.object({
  code: z.string().min(1),
  nomCommerce: z.string().min(1),
  responsable: z.string().optional(),
  telephone: z.string().optional(),
  adresse: z.string().optional(),
  ville: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

// Création : l'id peut être fourni par le mobile (client créé hors ligne, déjà
// utilisé par ses factures) ; renvoyer la même création ne crée pas de doublon.
const creationSchema = clientSchema.extend({ id: z.string().uuid().optional() });

// Matricule fiscale (code) déjà pris : message lisible tel quel dans l'app.
function erreurUnicite(res: Response, err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ error: "Ce matricule fiscal est déjà utilisé par un autre client de la société" });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
    return res.status(404).json({ error: "Client introuvable" });
  }
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

clientsRouter.post("/", async (req, res) => {
  const parsed = creationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    if (parsed.data.id) {
      const existant = await prisma.client.findFirst({ where: { id: parsed.data.id, societeId: req.societeId } });
      if (existant) return res.status(200).json(existant);
    }
    const client = await prisma.client.create({ data: { ...parsed.data, societeId: req.societeId! } });
    res.status(201).json(client);
  } catch (err) {
    erreurUnicite(res, err);
  }
});

clientsRouter.put("/:id", async (req, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const maj = await prisma.client.updateMany({ where: { id: req.params.id, societeId: req.societeId }, data: parsed.data });
    if (maj.count === 0) return res.status(404).json({ error: "Client introuvable" });
    res.json(await prisma.client.findUnique({ where: { id: req.params.id } }));
  } catch (err) {
    erreurUnicite(res, err);
  }
});

// Suppression logique ; un client inconnu ou déjà supprimé répond 204 aussi
// (suppression rejouée par la synchronisation hors ligne).
clientsRouter.delete("/:id", async (req, res) => {
  try {
    await prisma.client.updateMany({
      where: { id: req.params.id, societeId: req.societeId, deletedAt: null },
      data: { deletedAt: new Date(), actif: false },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
