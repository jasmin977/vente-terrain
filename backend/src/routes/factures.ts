import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { creerFacture } from "../services/factureService";
import { prochainNumeroFacture } from "../utils/numero";
import { reglementsFactures } from "../services/creditService";

export const facturesRouter = Router();
facturesRouter.use(requireAuth);

const ligneSchema = z.object({
  articleId: z.string().uuid(),
  quantite: z.number().positive(),
  prixUnitaire: z.number().nonnegative(),
  tauxTva: z.number().min(0).max(100),
});

const factureSchema = z.object({
  id: z.string().uuid().optional(), // fourni par le mobile pour idempotence hors-ligne
  numero: z.string().optional(),
  clientId: z.string().uuid(),
  date: z.coerce.date().optional(),
  typeVente: z.enum(["COMPTANT", "CREDIT"]),
  modePaiement: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TPE"]).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  lignes: z.array(ligneSchema).min(1),
});

// Prochain numéro du vendeur connecté (V001-26-0007) : le mobile numérote
// lui-même ses factures hors ligne et repart de là à chaque synchronisation.
facturesRouter.get("/numero-suivant", async (req, res) => {
  try {
    const vendeur = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id }, select: { code: true } });
    const numero = await prisma.$transaction((tx) => prochainNumeroFacture(tx, vendeur.code));
    res.json({ numero });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Module 3 - Facturation : création d'une facture, décrémente automatiquement
// le stock camion du vendeur (Module 6) et enregistre la position GPS (Module 9).
facturesRouter.post("/", async (req, res) => {
  const parsed = factureSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const facture = await creerFacture(req.user!.id, parsed.data);
    res.status(201).json(facture);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

/** Début de la journée en cours (heure du serveur). */
function debutDuJour() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Le vendeur ne consulte que ses propres factures du jour : l'historique et les
// autres vendeurs restent réservés à l'admin.
const visiblePourVendeur = (f: { vendeurId: string; date: Date }, vendeurId: string) =>
  f.vendeurId === vendeurId && f.date >= debutDuJour();

facturesRouter.get("/", async (req, res) => {
  const query = req.query as Record<string, string | undefined>;
  const { clientId } = query;
  let { vendeurId, dateFrom, dateTo } = query;
  if (req.user!.role === "VENDEUR") {
    vendeurId = req.user!.id;
    dateFrom = debutDuJour().toISOString();
    dateTo = undefined; // jusqu'à maintenant
  }
  // dateTo est une date sans heure (YYYY-MM-DD) : on l'étend à la fin de la
  // journée pour que le filtre inclue toutes les factures de ce jour-là.
  const dateToInclusive = dateTo && !dateTo.includes("T") ? `${dateTo}T23:59:59.999` : dateTo;
  const factures = await prisma.facture.findMany({
    where: {
      deletedAt: null,
      ...(clientId ? { clientId } : {}),
      ...(vendeurId ? { vendeurId } : {}),
      ...(dateFrom || dateToInclusive
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateToInclusive ? { lte: new Date(dateToInclusive) } : {}),
            },
          }
        : {}),
    },
    include: { lignes: { include: { article: true } }, client: true },
    orderBy: { date: "desc" },
    take: 500,
  });
  // Factures à crédit : ce qui est déjà réglé et ce qui reste (paiements + avances).
  const reglements = await reglementsFactures(factures);
  res.json(factures.map((f) => ({ ...f, reglement: reglements.get(f.id) ?? null })));
});

facturesRouter.get("/:id", async (req, res) => {
  const facture = await prisma.facture.findUnique({
    where: { id: req.params.id },
    include: {
      lignes: { include: { article: true } },
      client: true,
      // Jamais l'utilisateur complet (hash du mot de passe, version de session…).
      vendeur: { select: { id: true, nom: true, code: true } },
    },
  });
  if (!facture) return res.status(404).json({ error: "Bon de livraison introuvable" });
  if (req.user!.role === "VENDEUR" && !visiblePourVendeur(facture, req.user!.id)) {
    return res.status(403).json({ error: "Seuls les bons de livraison du jour sont consultables" });
  }
  const reglement = (await reglementsFactures([facture])).get(facture.id) ?? null;
  res.json({ ...facture, reglement });
});

// Seul l'admin peut annuler une facture : une fois validée, le vendeur ne
// peut plus revenir en arrière (traçabilité des ventes sur le terrain).
facturesRouter.post("/:id/annuler", requireAdmin, async (req, res) => {
  const facture = await prisma.facture.findUnique({ where: { id: req.params.id }, include: { lignes: true } });
  if (!facture) return res.status(404).json({ error: "Bon de livraison introuvable" });

  await prisma.$transaction(async (tx) => {
    for (const l of facture.lignes) {
      await tx.stockCamion.upsert({
        where: { vendeurId_articleId: { vendeurId: facture.vendeurId, articleId: l.articleId } },
        create: { vendeurId: facture.vendeurId, articleId: l.articleId, quantite: l.quantite },
        update: { quantite: { increment: l.quantite } },
      });
      // Tracé dans les mouvements pour que l'historique du camion reste lisible.
      await tx.mouvementStock.create({
        data: {
          vendeurId: facture.vendeurId,
          articleId: l.articleId,
          sens: "AJUSTEMENT",
          quantite: l.quantite,
          reference: `Annulation ${facture.numero}`,
        },
      });
    }
    await tx.facture.update({ where: { id: facture.id }, data: { statut: "ANNULEE" } });
  });

  res.status(204).send();
});
