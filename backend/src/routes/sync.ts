import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, requireSociete } from "../middleware/auth";
import { creerFacture } from "../services/factureService";

export const syncRouter = Router();
syncRouter.use(requireAuth, requireSociete);

// --- PULL : le mobile envoie la date de sa dernière synchro réussie et reçoit
// tout ce qui a changé depuis (créations, modifications, suppressions logiques
// via deletedAt) pour les tables partagées. Le stock camion n'est jamais envoyé
// à un vendeur : il ne doit pas connaître le stock théorique de son camion.
syncRouter.get("/pull", async (req, res) => {
  const sinceRaw = req.query.since as string | undefined;
  const since = sinceRaw ? new Date(sinceRaw) : new Date(0);
  const vendeurId = req.user!.id;
  const serverTime = new Date();

  const [articles, clients, factures, retours, paiements, stockCamion, visites] = await Promise.all([
    prisma.article.findMany({ where: { updatedAt: { gt: since }, societeId: req.societeId } }),
    prisma.client.findMany({ where: { updatedAt: { gt: since }, societeId: req.societeId } }),
    prisma.facture.findMany({
      where: { updatedAt: { gt: since }, vendeurId },
      include: { lignes: true },
    }),
    prisma.retour.findMany({
      where: { updatedAt: { gt: since }, vendeurId },
      include: { lignes: true },
    }),
    prisma.paiement.findMany({ where: { updatedAt: { gt: since }, vendeurId } }),
    req.user!.role === "ADMIN"
      ? prisma.stockCamion.findMany({ where: { updatedAt: { gt: since }, vendeurId } })
      : Promise.resolve([]),
    prisma.visite.findMany({ where: { updatedAt: { gt: since }, vendeurId } }),
  ]);

  res.json({ serverTime, articles, clients, factures, retours, paiements, stockCamion, visites });
});

const pushSchema = z.object({
  clients: z
    .array(
      z.object({
        id: z.string().uuid(),
        code: z.string(),
        nomCommerce: z.string(),
        responsable: z.string().optional(),
        telephone: z.string().optional(),
        adresse: z.string().optional(),
        ville: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
      })
    )
    .default([]),
  factures: z
    .array(
      z.object({
        id: z.string().uuid(),
        numero: z.string().optional(),
        clientId: z.string().uuid(),
        date: z.coerce.date().optional(),
        typeVente: z.enum(["COMPTANT", "CREDIT"]),
        modePaiement: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TPE"]).optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        lignes: z.array(
          z.object({
            articleId: z.string().uuid(),
            quantite: z.number().positive(),
            prixUnitaire: z.number().nonnegative(),
            tauxTva: z.number().min(0).max(100),
          })
        ),
      })
    )
    .default([]),
  paiements: z
    .array(
      z.object({
        id: z.string().uuid(),
        clientId: z.string().uuid(),
        factureId: z.string().uuid().optional(),
        montant: z.number().positive(),
        mode: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TPE"]),
        reference: z.string().optional(),
        date: z.coerce.date().optional(),
      })
    )
    .default([]),
  retours: z
    .array(
      z.object({
        id: z.string().uuid(),
        clientId: z.string().uuid(),
        motif: z.string().optional(),
        lignes: z.array(
          z.object({ articleId: z.string().uuid(), quantite: z.number().positive(), montant: z.number().nonnegative() })
        ),
      })
    )
    .default([]),
  visites: z
    .array(
      z.object({
        id: z.string().uuid(),
        clientId: z.string().uuid().optional(),
        latitude: z.number(),
        longitude: z.number(),
        date: z.coerce.date().optional(),
      })
    )
    .default([]),
});

// --- PUSH : le mobile envoie tout ce qu'il a créé/modifié hors-ligne. Chaque
// entité porte un id (UUID) généré côté client pour que le push soit rejouable
// sans jamais créer de doublon (idempotence en cas de coupure réseau pendant
// l'envoi). Les erreurs sont retournées par entité pour ne pas bloquer tout le
// lot si une seule facture a un problème (ex: stock insuffisant).
syncRouter.post("/push", async (req, res) => {
  const parsed = pushSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const data = parsed.data;
  const vendeurId = req.user!.id;

  const resultats = {
    clients: [] as Array<{ id: string; ok: boolean; error?: string }>,
    factures: [] as Array<{ id: string; ok: boolean; error?: string }>,
    paiements: [] as Array<{ id: string; ok: boolean; error?: string }>,
    retours: [] as Array<{ id: string; ok: boolean; error?: string }>,
    visites: [] as Array<{ id: string; ok: boolean; error?: string }>,
  };

  for (const c of data.clients) {
    try {
      // Un client d'une autre société n'est jamais modifié.
      const autre = await prisma.client.findFirst({ where: { id: c.id, NOT: { societeId: req.societeId } }, select: { id: true } });
      if (autre) throw new Error("Client introuvable");
      await prisma.client.upsert({ where: { id: c.id }, create: { ...c, societeId: req.societeId! }, update: c });
      resultats.clients.push({ id: c.id, ok: true });
    } catch (err) {
      resultats.clients.push({ id: c.id, ok: false, error: (err as Error).message });
    }
  }

  for (const f of data.factures) {
    try {
      await creerFacture(vendeurId, f, req.societeId!);
      resultats.factures.push({ id: f.id, ok: true });
    } catch (err) {
      resultats.factures.push({ id: f.id, ok: false, error: (err as Error).message });
    }
  }

  for (const p of data.paiements) {
    try {
      const client = await prisma.client.findFirst({ where: { id: p.clientId, societeId: req.societeId }, select: { id: true } });
      if (!client) throw new Error("Client introuvable");
      const existing = await prisma.paiement.findUnique({ where: { id: p.id } });
      if (!existing) {
        await prisma.paiement.create({ data: { ...p, vendeurId, date: p.date ?? new Date() } });
      }
      resultats.paiements.push({ id: p.id, ok: true });
    } catch (err) {
      resultats.paiements.push({ id: p.id, ok: false, error: (err as Error).message });
    }
  }

  for (const r of data.retours) {
    try {
      const existing = await prisma.retour.findUnique({ where: { id: r.id } });
      if (!existing) {
        await prisma.$transaction(async (tx) => {
          const client = await tx.client.findFirst({ where: { id: r.clientId, societeId: req.societeId }, select: { nomCommerce: true } });
          if (!client) throw new Error("Client introuvable");
          for (const l of r.lignes) {
            await tx.stockCamion.upsert({
              where: { vendeurId_articleId: { vendeurId, articleId: l.articleId } },
              create: { vendeurId, articleId: l.articleId, quantite: l.quantite },
              update: { quantite: { increment: l.quantite } },
            });
            await tx.mouvementStock.create({
              data: { vendeurId, articleId: l.articleId, sens: "RETOUR_CLIENT", quantite: l.quantite, reference: client?.nomCommerce },
            });
          }
          await tx.retour.create({
            data: { id: r.id, clientId: r.clientId, vendeurId, motif: r.motif, lignes: { create: r.lignes } },
          });
        });
      }
      resultats.retours.push({ id: r.id, ok: true });
    } catch (err) {
      resultats.retours.push({ id: r.id, ok: false, error: (err as Error).message });
    }
  }

  for (const v of data.visites) {
    try {
      const existing = await prisma.visite.findUnique({ where: { id: v.id } });
      if (!existing) {
        await prisma.visite.create({ data: { ...v, vendeurId, date: v.date ?? new Date() } });
      }
      resultats.visites.push({ id: v.id, ok: true });
    } catch (err) {
      resultats.visites.push({ id: v.id, ok: false, error: (err as Error).message });
    }
  }

  res.json({ serverTime: new Date(), resultats });
});
