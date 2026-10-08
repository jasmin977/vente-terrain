import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { situationClient, situationsClients } from "../services/creditService";

// Crédits clients : factures à crédit impayées regroupées par client, paiement
// d'une facture, avance sur le compte d'un client, annulation d'un paiement.
// Accessible aux vendeurs (ils encaissent sur le terrain) et à l'admin.
export const creditsRouter = Router();
creditsRouter.use(requireAuth);

const EPS = 0.0005;
const arrondi = (n: number) => Math.round(n * 1000) / 1000;

function serverError(res: Response, err: unknown) {
  console.error(err);
  return res.status(500).json({ error: "Erreur serveur" });
}

class Refus extends Error {}

// Date du paiement : choisie par le vendeur (argent reçu un autre jour), jamais
// dans le futur. Par défaut : maintenant.
const dateSchema = z.coerce
  .date()
  .optional()
  .refine((d) => !d || d.getTime() <= Date.now() + 60_000, "La date du paiement ne peut pas être dans le futur");

const modeSchema = z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TPE"]);

const premiereErreur = (err: z.ZodError) => err.issues[0]?.message ?? "Données invalides";

// Liste des clients ayant une dette, avec leurs factures impayées.
creditsRouter.get("/", async (_req, res) => {
  try {
    const situations = await situationsClients();
    const ids = [...situations.entries()].filter(([, s]) => s.totalDu > EPS).map(([id]) => id);
    const clients = await prisma.client.findMany({
      where: { id: { in: ids } },
      select: { id: true, code: true, nomCommerce: true, ville: true, telephone: true },
    });
    const result = clients
      .map((c) => ({ client: c, ...situations.get(c.id)! }))
      .sort((a, b) => b.totalDu - a.totalDu);
    res.json(result);
  } catch (err) {
    serverError(res, err);
  }
});

// Situation détaillée d'un client + ses derniers encaissements sur crédit.
creditsRouter.get("/clients/:id", async (req, res) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      select: { id: true, code: true, nomCommerce: true, ville: true, telephone: true },
    });
    if (!client) return res.status(404).json({ error: "Client introuvable" });
    const situation = await situationClient(client.id);
    const paiements = await prisma.paiement.findMany({
      where: {
        clientId: client.id,
        deletedAt: null,
        // Encaissements de crédit uniquement (pas les règlements des ventes comptant).
        OR: [{ factureId: null }, { facture: { typeVente: "CREDIT" } }],
      },
      include: {
        facture: { select: { id: true, numero: true } },
        vendeur: { select: { id: true, nom: true, code: true } },
      },
      orderBy: { date: "desc" },
      take: 50,
    });
    res.json({ client, ...situation, paiements });
  } catch (err) {
    serverError(res, err);
  }
});

const payerSchema = z.object({
  id: z.string().uuid().optional(),
  mode: modeSchema,
  date: dateSchema,
  reference: z.string().trim().max(120).optional(),
});

// Solde le reste à payer d'une facture à crédit.
creditsRouter.post("/factures/:id/payer", async (req, res) => {
  const parsed = payerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  const data = parsed.data;
  try {
    if (data.id) {
      const existant = await prisma.paiement.findUnique({ where: { id: data.id } });
      if (existant) return res.status(200).json(existant);
    }
    const paiement = await prisma.$transaction(async (tx) => {
      const facture = await tx.facture.findUnique({ where: { id: req.params.id } });
      if (!facture || facture.deletedAt) throw new Refus("Bon de livraison introuvable");
      if (facture.typeVente !== "CREDIT") throw new Refus("Ce bon de livraison n'est pas une vente à crédit");
      if (facture.statut !== "VALIDEE") throw new Refus("Ce bon de livraison est annulé");
      const situation = await situationClient(facture.clientId, tx);
      const ligne = situation.factures.find((f) => f.id === facture.id);
      if (!ligne) throw new Refus("Ce bon de livraison est déjà payé");
      return tx.paiement.create({
        data: {
          id: data.id,
          clientId: facture.clientId,
          factureId: facture.id,
          vendeurId: req.user!.id,
          montant: ligne.reste,
          mode: data.mode,
          reference: data.reference || null,
          date: data.date ?? new Date(),
        },
      });
    });
    res.status(201).json(paiement);
  } catch (err) {
    if (err instanceof Refus) return res.status(409).json({ error: err.message });
    serverError(res, err);
  }
});

const avanceSchema = z.object({
  id: z.string().uuid().optional(),
  clientId: z.string().uuid(),
  montant: z.number().positive("Le montant doit être positif"),
  mode: modeSchema,
  date: dateSchema,
  reference: z.string().trim().max(120).optional(),
});

// Avance (paiement partiel) sur le compte d'un client : imputée aux factures
// les plus anciennes. Elle ne peut pas dépasser ce que le client doit.
creditsRouter.post("/avance", async (req, res) => {
  const parsed = avanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: premiereErreur(parsed.error) });
  const data = parsed.data;
  try {
    if (data.id) {
      const existant = await prisma.paiement.findUnique({ where: { id: data.id } });
      if (existant) return res.status(200).json(existant);
    }
    const paiement = await prisma.$transaction(async (tx) => {
      const situation = await situationClient(data.clientId, tx);
      const montant = arrondi(data.montant);
      if (situation.totalDu <= EPS) throw new Refus("Ce client n'a aucun crédit en cours");
      if (montant > situation.totalDu + EPS) {
        throw new Refus(`L'avance dépasse le total dû par ce client (${situation.totalDu.toFixed(3)} TND)`);
      }
      return tx.paiement.create({
        data: {
          id: data.id,
          clientId: data.clientId,
          vendeurId: req.user!.id,
          montant,
          mode: data.mode,
          reference: data.reference || null,
          date: data.date ?? new Date(),
        },
      });
    });
    res.status(201).json(paiement);
  } catch (err) {
    if (err instanceof Refus) return res.status(409).json({ error: err.message });
    serverError(res, err);
  }
});

// Annulation d'un encaissement saisi par erreur (admin) : la dette revient.
creditsRouter.delete("/paiements/:id", requireAdmin, async (req, res) => {
  try {
    const p = await prisma.paiement.findUnique({ where: { id: req.params.id }, include: { facture: true } });
    if (!p || p.deletedAt) return res.status(404).json({ error: "Paiement introuvable" });
    if (p.facture?.typeVente === "COMPTANT") {
      return res.status(409).json({ error: "Ce règlement appartient à une vente comptant : annulez le bon de livraison." });
    }
    await prisma.paiement.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    res.status(204).send();
  } catch (err) {
    serverError(res, err);
  }
});
