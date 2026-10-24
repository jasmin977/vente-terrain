import { Router } from "express";
import type { Prisma, TypeAchat } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { arrondi, calculerLignes, netAPayer, payesParAchat, situation, TIMBRE } from "../services/achatService";
import { entrerAchatAuDepot, retirerAchatDuDepot } from "../services/stockAchat";
import { fournisseurDivers } from "../services/achatService";
import { dateExpirationSchema } from "../lib/lotsDepot";

/**
 * Achats › bons de livraison et factures des fournisseurs. Un BL devient facture quand le fournisseur apporte
 * la facture papier (`POST /transformer`) : la facture reprend leurs lignes et leurs règlements, les BL ne sont
 * plus modifiables.
 */
export const achatsRouter = Router();
achatsRouter.use(requireAuth, requireSociete, requireAdmin);

/**
 * Numéro automatique, non modifiable : AAAA/001 par société, par type (BL / facture) et par année.
 * Plus grand numéro existant + 1 (un document supprimé garde son numéro, les autres ne sont pas renumérotés).
 */
async function prochainNumeroAchat(tx: Prisma.TransactionClient, societeId: string, type: TypeAchat, annee: number) {
  const prefixe = `${annee}/`;
  const existants = await tx.achat.findMany({ where: { societeId, type, numero: { startsWith: prefixe } }, select: { numero: true } });
  const max = existants.reduce((m, a) => Math.max(m, Number(a.numero.slice(prefixe.length)) || 0), 0);
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

const FOURNISSEUR = { id: true, nom: true, ref: true, divers: true, matriculeFiscal: true, adresse: true, ville: true, telephone: true, email: true } as const;

const ligneSchema = z.object({
  articleId: z.string().uuid().optional().nullable(),
  designation: z.string().trim().min(1).max(300),
  quantite: z.number().positive(),
  prixUnitaire: z.number().nonnegative(),
  tauxTva: z.number().min(0).max(100),
  // Expiration des pièces reçues (AAAA-MM-JJ), facultative.
  dateExpiration: dateExpirationSchema.nullish(),
  // Nouveau prix de vente HT choisi à la saisie (marge gardée, ou prix tapé) ; absent : prix de vente inchangé.
  prixVente: z.number().nonnegative().optional(),
});

const achatSchema = z.object({
  type: z.enum(["BL", "FACTURE", "ENTREE"]),
  // BL et facture : numéro du papier du fournisseur (obligatoire). B° Entrée : numéro automatique.
  numero: z.string().trim().max(80).optional().nullable(),
  // Ignoré pour un B° Entrée (pas de fournisseur : « Divers »).
  fournisseurId: z.string().uuid().optional().nullable(),
  // Achat « Divers » : chez qui (facultatif).
  fournisseurLibre: z.string().trim().max(160).optional().nullable(),
  date: z.coerce.date(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lignes: z.array(ligneSchema).min(1),
});

achatsRouter.get("/", async (req, res) => {
  const { type, fournisseurId, dateFrom, dateTo, statut } = req.query as Record<string, string | undefined>;
  const achats = await prisma.achat.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(type === "BL" || type === "FACTURE" ? { type } : {}),
      ...(fournisseurId ? { fournisseurId } : {}),
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
    },
    include: { fournisseur: { select: FOURNISSEUR }, facture: { select: { id: true, numero: true } }, _count: { select: { bons: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  const payes = await payesParAchat(achats.map((a) => a.id));
  const liste = achats.map((a) => ({ ...a, ...situation(a, payes) }));
  // statut=impaye : reste à payer ; statut=paye : entièrement réglé.
  res.json(
    statut === "impaye" ? liste.filter((a) => a.reste > 0) : statut === "paye" ? liste.filter((a) => a.statut === "PAYE") : liste,
  );
});

achatsRouter.get("/numero-suivant", async (req, res) => {
  const type = req.query.type === "BL" ? "BL" : req.query.type === "ENTREE" ? "ENTREE" : "FACTURE";
  const annee = Number(req.query.annee) || new Date().getFullYear();
  res.json({ numero: await prisma.$transaction((tx) => prochainNumeroAchat(tx, req.societeId!, type, annee)) });
});

achatsRouter.get("/:id", async (req, res) => {
  const a = await prisma.achat.findFirst({
    where: { id: req.params.id, societeId: req.societeId, deletedAt: null },
    include: {
      fournisseur: { select: FOURNISSEUR },
      lignes: { include: { article: { select: { id: true, designation: true, code: true, codeBarre: true } } } },
      reglements: { where: { deletedAt: null }, orderBy: { date: "asc" } },
      facture: { select: { id: true, numero: true, date: true } },
      bons: { where: { deletedAt: null }, select: { id: true, numero: true, date: true, montantTTC: true }, orderBy: { date: "asc" } },
    },
  });
  if (!a) return res.status(404).json({ error: "Document introuvable" });
  const payes = await payesParAchat([a.id]);
  res.json({ ...a, ...situation(a, payes) });
});

// Fiche article › Fournisseurs : chaque réception de l'article (BL, facture, B° Entrée), du plus récent au plus
// ancien. Une facture issue de BL n'est pas comptée : ses lignes sont celles des BL, déjà là (à leur date de réception).
achatsRouter.get("/article/:articleId", async (req, res) => {
  const lignes = await prisma.ligneAchat.findMany({
    where: { articleId: req.params.articleId, achat: { societeId: req.societeId, deletedAt: null, NOT: { type: "FACTURE", bons: { some: {} } } } },
    select: {
      id: true,
      quantite: true,
      prixUnitaire: true,
      tauxTva: true,
      dateExpiration: true,
      achat: { select: { id: true, type: true, numero: true, date: true, fournisseurLibre: true, fournisseur: { select: { id: true, nom: true, ref: true, divers: true } } } },
    },
    orderBy: { achat: { date: "desc" } },
    take: 500,
  });
  res.json(
    lignes.map((l) => ({
      id: l.id,
      quantite: Number(l.quantite),
      prixUnitaire: Number(l.prixUnitaire),
      tauxTva: Number(l.tauxTva),
      dateExpiration: l.dateExpiration ? l.dateExpiration.toISOString().slice(0, 10) : null,
      achat: { id: l.achat.id, type: l.achat.type, numero: l.achat.numero, date: l.achat.date, fournisseurLibre: l.achat.fournisseurLibre },
      fournisseur: l.achat.fournisseur,
    })),
  );
});

achatsRouter.post("/", async (req, res) => {
  const parsed = achatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  if (d.type !== "ENTREE" && !d.numero) return res.status(400).json({ error: "Le numéro du document du fournisseur est obligatoire." });
  if (d.type !== "ENTREE" && !d.fournisseurId) return res.status(400).json({ error: "Le fournisseur est obligatoire." });
  // B° Entrée : jamais de fournisseur ; rangé sous « Divers » pour être réglé et suivi comme les autres achats.
  const fournisseur = d.fournisseurId && d.type !== "ENTREE"
    ? await prisma.fournisseur.findFirst({ where: { id: d.fournisseurId, societeId: req.societeId, deletedAt: null }, select: { id: true, divers: true, nom: true } })
    : await fournisseurDivers(req.societeId!);
  if (!fournisseur) return res.status(404).json({ error: "Fournisseur introuvable" });
  const calcul = calculerLignes(d.lignes);
  // Le document et l'entrée de sa marchandise au dépôt vont ensemble (tout ou rien).
  const a = await prisma.$transaction(async (tx) => {
    const cree = await tx.achat.create({
    data: {
      stockAjoute: true,
      societeId: req.societeId!,
      fournisseurId: fournisseur.id,
      type: d.type,
      numero: d.type === "ENTREE" ? await prochainNumeroAchat(tx, req.societeId!, "ENTREE", d.date.getFullYear()) : d.numero!,
      fournisseurLibre: fournisseur.divers ? d.fournisseurLibre || null : null,
      date: d.date,
      notes: d.notes ?? null,
      montantHT: calcul.montantHT,
      montantTVA: calcul.montantTVA,
      montantTTC: calcul.montantTTC,
      timbre: d.type === "FACTURE" ? TIMBRE : 0,
      lignes: { create: calcul.lignes.map((l, i) => ({ ...l, dateExpiration: d.lignes[i].dateExpiration ?? null })) },
    },
    include: { fournisseur: { select: FOURNISSEUR } },
    });
    await entrerAchatAuDepot(
      tx,
      {
        type: d.type,
        numero: cree.numero,
        fournisseurNom: fournisseur.divers ? d.fournisseurLibre || "Divers" : fournisseur.nom,
        lignes: calcul.lignes.map((l, i) => ({ ...l, dateExpiration: d.lignes[i].dateExpiration ?? null, prixVente: d.lignes[i].prixVente })),
      },
      req.user!.id,
    );
    return cree;
  });
  res.status(201).json({ ...a, paye: 0, reste: netAPayer(a), statut: "NON_PAYE" });
});

// BL → facture : les BL d'un même fournisseur sont regroupés dans une nouvelle facture (lignes identiques
// additionnées) ; leurs règlements passent sur la facture.
const transformationSchema = z.object({
  bonIds: z.array(z.string().uuid()).min(1),
  // Numéro de la facture papier du fournisseur.
  numero: z.string().trim().min(1).max(80),
  date: z.coerce.date(),
});

achatsRouter.post("/transformer", async (req, res) => {
  const parsed = transformationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const ids = [...new Set(parsed.data.bonIds)];
  try {
    const facture = await prisma.$transaction(async (tx) => {
      const bons = await tx.achat.findMany({ where: { id: { in: ids }, societeId: req.societeId, deletedAt: null }, include: { lignes: true } });
      if (bons.length !== ids.length) throw new Error("Un des bons de livraison est introuvable");
      if (bons.some((b) => b.type !== "BL")) throw new Error("Seuls des bons de livraison peuvent être transformés en facture");
      if (bons.some((b) => b.factureId)) throw new Error("Un des bons de livraison est déjà facturé");
      const fournisseurs = new Set(bons.map((b) => b.fournisseurId));
      if (fournisseurs.size !== 1) throw new Error("Les bons de livraison doivent être du même fournisseur");

      const regroupe = new Map<string, { articleId: string | null; designation: string; quantite: number; prixUnitaire: number; tauxTva: number }>();
      for (const b of bons) {
        for (const l of b.lignes) {
          const cle = `${l.articleId ?? l.designation}|${Number(l.prixUnitaire)}|${Number(l.tauxTva)}`;
          const cur = regroupe.get(cle) ?? { articleId: l.articleId, designation: l.designation, quantite: 0, prixUnitaire: Number(l.prixUnitaire), tauxTva: Number(l.tauxTva) };
          cur.quantite = arrondi(cur.quantite + Number(l.quantite));
          regroupe.set(cle, cur);
        }
      }
      const calcul = calculerLignes([...regroupe.values()]);
      const creee = await tx.achat.create({
        data: {
          societeId: req.societeId!,
          fournisseurId: [...fournisseurs][0],
          type: "FACTURE",
          numero: parsed.data.numero,
          date: parsed.data.date,
          montantHT: calcul.montantHT,
          montantTVA: calcul.montantTVA,
          montantTTC: calcul.montantTTC,
          timbre: TIMBRE,
          lignes: { create: calcul.lignes },
        },
      });
      const maj = await tx.achat.updateMany({ where: { id: { in: ids }, factureId: null }, data: { factureId: creee.id } });
      if (maj.count !== ids.length) throw new Error("Un des bons de livraison est déjà facturé");
      await tx.reglementFournisseur.updateMany({ where: { achatId: { in: ids }, deletedAt: null }, data: { achatId: creee.id } });
      return creee;
    });
    res.status(201).json(facture);
  } catch (err) {
    res.status(409).json({ error: (err as Error).message });
  }
});

// Suppression logique. Refusée pour un BL déjà facturé ou un document qui a des règlements (à supprimer d'abord).
// Supprimer une facture issue de BL rend ces BL de nouveau modifiables.
achatsRouter.delete("/:id", async (req, res) => {
  const a = await prisma.achat.findFirst({
    where: { id: req.params.id, societeId: req.societeId, deletedAt: null },
    include: { lignes: true, fournisseur: { select: { nom: true, divers: true } } },
  });
  if (!a) return res.status(204).send();
  if (a.factureId) return res.status(409).json({ error: "Ce bon de livraison est facturé : supprimez d'abord la facture." });
  const nbReglements = await prisma.reglementFournisseur.count({ where: { achatId: a.id, deletedAt: null } });
  if (nbReglements > 0) return res.status(409).json({ error: "Ce document a des règlements : supprimez-les d'abord." });
  await prisma.$transaction(async (tx) => {
    await tx.achat.updateMany({ where: { factureId: a.id }, data: { factureId: null } });
    await tx.achat.update({ where: { id: a.id }, data: { deletedAt: new Date() } });
    // Sa marchandise sort du dépôt.
    if (a.stockAjoute) {
      await retirerAchatDuDepot(tx, {
        type: a.type,
        numero: a.numero,
        fournisseurNom: a.fournisseur.divers ? a.fournisseurLibre || "Divers" : a.fournisseur.nom,
        lignes: a.lignes,
      });
    }
  });
  res.status(204).send();
});
