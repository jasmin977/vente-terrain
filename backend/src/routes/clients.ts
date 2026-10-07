import { Router, type Response } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/auth";
import { calculerSolde, reglementsFactures, situationsClients } from "../services/creditService";

export const clientsRouter = Router();
clientsRouter.use(requireAuth);

// Module 2 - Gestion Clients
clientsRouter.get("/", async (req, res) => {
  const { q } = req.query as Record<string, string | undefined>;
  const clients = await prisma.client.findMany({
    where: {
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
    take: 200,
  });

  // Solde = reste dû sur les factures à crédit (voir services/creditService).
  const situations = await situationsClients(clients.map((c) => c.id));
  res.json(clients.map((client) => ({ ...client, solde: situations.get(client.id)?.totalDu ?? 0 })));
});


clientsRouter.get("/:id", async (req, res) => {
  const client = await prisma.client.findUnique({ where: { id: req.params.id } });
  if (!client) return res.status(404).json({ error: "Client introuvable" });
  res.json({ ...client, solde: await calculerSolde(client.id) });
});

// Historique complet : factures, retours, paiements (Module 2)
clientsRouter.get("/:id/historique", async (req, res) => {
  const clientId = req.params.id;
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

// Matricule fiscale (code) déjà pris : message lisible tel quel dans l'app.
function erreurUnicite(res: Response, err: unknown) {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    return res.status(409).json({ error: "Ce matricule fiscal est déjà utilisé par un autre client" });
  }
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

clientsRouter.post("/", async (req, res) => {
  const parsed = clientSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const client = await prisma.client.create({ data: parsed.data });
    res.status(201).json(client);
  } catch (err) {
    erreurUnicite(res, err);
  }
});

clientsRouter.put("/:id", async (req, res) => {
  const parsed = clientSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const client = await prisma.client.update({ where: { id: req.params.id }, data: parsed.data });
    res.json(client);
  } catch (err) {
    erreurUnicite(res, err);
  }
});

clientsRouter.delete("/:id", async (req, res) => {
  await prisma.client.update({ where: { id: req.params.id }, data: { deletedAt: new Date(), actif: false } });
  res.status(204).send();
});
