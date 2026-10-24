import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

/**
 * Factures établies en regroupant des bons de livraison (Ventes > Transformation BL en Facture).
 * Les bons utilisés sont marqués (`factureVenteId`) et ne sont plus listés comme bons.
 */
export const facturesVenteRouter = Router();
facturesVenteRouter.use(requireAuth, requireSociete, requireAdmin);

const CLIENT = { id: true, nomCommerce: true, code: true, ref: true, adresse: true, ville: true, telephone: true } as const;

const arrondi = (n: number) => Math.round(n * 1000) / 1000;

/** Prochain numéro AAAA/001 de la société (la séquence repart à 001 chaque année). */
async function prochainNumero(tx: Prisma.TransactionClient, societeId: string, annee: number) {
  const prefixe = `${annee}/`;
  // Plus grand numéro existant + 1 : supprimer la dernière facture libère son numéro, supprimer une facture du
  // milieu laisse un trou (les factures déjà émises gardent leur numéro, on ne les renumérote pas).
  const existants = await tx.factureVente.findMany({ where: { societeId, numero: { startsWith: prefixe } }, select: { numero: true } });
  const max = existants.reduce((m, f) => Math.max(m, Number(f.numero.slice(prefixe.length)) || 0), 0);
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

facturesVenteRouter.get("/numero-suivant", async (req, res) => {
  const annee = Number(req.query.annee) || new Date().getFullYear();
  const numero = await prisma.$transaction((tx) => prochainNumero(tx, req.societeId!, annee));
  res.json({ numero });
});

facturesVenteRouter.get("/", async (req, res) => {
  const { dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const factures = await prisma.factureVente.findMany({
    where: {
      societeId: req.societeId,
      ...(dateFrom || dateTo
        ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } }
        : {}),
    },
    include: { _count: { select: { bons: true } }, client: { select: CLIENT } },
    orderBy: { date: "desc" },
    take: 500,
  });
  res.json(factures);
});

facturesVenteRouter.get("/:id", async (req, res) => {
  const facture = await prisma.factureVente.findFirst({
    where: { id: req.params.id, societeId: req.societeId },
    include: {
      client: { select: CLIENT },
      lignes: { include: { article: true } },
      // Les bons d'origine, chacun avec ses articles : le détail les présente bon par bon.
      bons: {
        select: { id: true, numero: true, date: true, montantHT: true, montantTTC: true, lignes: { include: { article: true } } },
        orderBy: { numero: "desc" },
      },
    },
  });
  if (!facture) return res.status(404).json({ error: "Facture introuvable" });
  res.json(facture);
});

const transformationSchema = z.object({
  date: z.coerce.date(),
  bonIds: z.array(z.string().uuid()).min(1),
});

facturesVenteRouter.post("/", async (req, res) => {
  const parsed = transformationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { date, bonIds } = parsed.data;
  const ids = [...new Set(bonIds)];

  try {
    const facture = await prisma.$transaction(async (tx) => {
      const bons = await tx.facture.findMany({
        where: { id: { in: ids }, deletedAt: null, client: { societeId: req.societeId } },
        include: { lignes: true },
      });
      if (bons.length !== ids.length) throw new Error("Un des bons de livraison est introuvable");
      if (bons.some((b) => b.statut !== "VALIDEE")) throw new Error("Un bon de livraison annulé ne peut pas être facturé");
      if (bons.some((b) => b.factureVenteId)) throw new Error("Un des bons de livraison est déjà transformé en facture");

      // Mêmes article, prix et TVA : une seule ligne, quantités additionnées.
      const regroupe = new Map<string, { articleId: string; quantite: number; prixUnitaire: number; tauxTva: number; montantHT: number; montantTTC: number }>();
      for (const b of bons) {
        for (const l of b.lignes) {
          const cle = `${l.articleId}|${Number(l.prixUnitaire)}|${Number(l.tauxTva)}`;
          const cur = regroupe.get(cle) ?? { articleId: l.articleId, quantite: 0, prixUnitaire: Number(l.prixUnitaire), tauxTva: Number(l.tauxTva), montantHT: 0, montantTTC: 0 };
          cur.quantite += Number(l.quantite);
          cur.montantHT += Number(l.montantHT);
          cur.montantTTC += Number(l.montantTTC);
          regroupe.set(cle, cur);
        }
      }
      const lignes = [...regroupe.values()].map((l) => ({ ...l, quantite: arrondi(l.quantite), montantHT: arrondi(l.montantHT), montantTTC: arrondi(l.montantTTC) }));
      const montantHT = arrondi(bons.reduce((s, b) => s + Number(b.montantHT), 0));
      const montantTTC = arrondi(bons.reduce((s, b) => s + Number(b.montantTTC), 0));

      const numero = await prochainNumero(tx, req.societeId!, date.getFullYear());
      // Tous les bons du même client : la facture porte ce client (sinon elle reste sans client).
      const clients = new Set(bons.map((b) => b.clientId));
      const creee = await tx.factureVente.create({
        include: { client: { select: CLIENT } },
        data: { societeId: req.societeId!, clientId: clients.size === 1 ? [...clients][0] : null, numero, date, montantHT, montantTVA: arrondi(montantTTC - montantHT), montantTTC, lignes: { create: lignes } },
      });
      // Marquage conditionnel : une double demande ne facture pas deux fois le même bon.
      const maj = await tx.facture.updateMany({ where: { id: { in: ids }, factureVenteId: null }, data: { factureVenteId: creee.id } });
      if (maj.count !== ids.length) throw new Error("Un des bons de livraison est déjà transformé en facture");
      return creee;
    });
    res.status(201).json(facture);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

// Seule la date d'une facture peut être modifiée : le numéro et le contenu sont figés.
facturesVenteRouter.put("/:id", async (req, res) => {
  const parsed = z.object({ date: z.coerce.date() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const maj = await prisma.factureVente.updateMany({ where: { id: req.params.id, societeId: req.societeId }, data: { date: parsed.data.date } });
  if (maj.count === 0) return res.status(404).json({ error: "Facture introuvable" });
  res.json({ ok: true });
});

// Supprimer une facture rend ses bons de livraison : ils réapparaissent comme bons à transformer.
facturesVenteRouter.delete("/:id", async (req, res) => {
  try {
    const ok = await prisma.$transaction(async (tx) => {
      const facture = await tx.factureVente.findFirst({ where: { id: req.params.id, societeId: req.societeId }, select: { id: true } });
      if (!facture) return false;
      await tx.facture.updateMany({ where: { factureVenteId: facture.id }, data: { factureVenteId: null } });
      await tx.ligneFactureVente.deleteMany({ where: { factureVenteId: facture.id } });
      await tx.factureVente.delete({ where: { id: facture.id } });
      return true;
    });
    if (!ok) return res.status(404).json({ error: "Facture introuvable" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
