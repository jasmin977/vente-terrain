import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { arrondi, payesParAchat, situation } from "../services/achatService";

/** Fournisseurs › règlements : ce qui reste à payer, les paiements faits, et leur saisie. */
export const reglementsFournisseursRouter = Router();
reglementsFournisseursRouter.use(requireAuth, requireSociete, requireAdmin);

const FOURNISSEUR = { id: true, nom: true, ref: true, divers: true } as const;

const unMoisApres = (d: Date) => {
  const e = new Date(d);
  e.setMonth(e.getMonth() + 1);
  return e;
};
// Modes d'un règlement fournisseur : pas de TPE, la traite à la place.

reglementsFournisseursRouter.get("/", async (req, res) => {
  const { fournisseurId, mode, dateFrom, dateTo } = req.query as Record<string, string | undefined>;
  const reglements = await prisma.reglementFournisseur.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(fournisseurId ? { fournisseurId } : {}),
      ...(mode ? { mode: mode as "ESPECES" | "CHEQUE" | "VIREMENT" | "TRAITE" } : {}),
      ...(dateFrom || dateTo ? { date: { ...(dateFrom ? { gte: new Date(dateFrom) } : {}), ...(dateTo ? { lte: new Date(dateTo) } : {}) } } : {}),
    },
    include: {
      fournisseur: { select: FOURNISSEUR },
      achat: { select: { id: true, type: true, numero: true, date: true, fournisseurLibre: true } },
      compteBancaire: { select: { id: true, banque: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 1000,
  });
  res.json(reglements);
});

// Ce qu'on doit encore : par fournisseur, ses documents pas entièrement réglés et ses avances sans document.
reglementsFournisseursRouter.get("/impayes", async (req, res) => {
  const type = req.query.type as string | undefined;
  const docs = await prisma.achat.findMany({
    where: { societeId: req.societeId, deletedAt: null, factureId: null, ...(type === "BL" || type === "FACTURE" ? { type } : {}) },
    include: { fournisseur: { select: FOURNISSEUR } },
    orderBy: { date: "asc" },
  });
  const payes = await payesParAchat(docs.map((d) => d.id));
  const parFournisseur = new Map<
    string,
    { fournisseur: { id: string; nom: string; ref: number; divers: boolean }; documents: unknown[]; totalDu: number; plusAncien: Date; avances: number }
  >();
  for (const d of docs) {
    const s = situation(d, payes);
    if (s.reste <= 0) continue;
    const g = parFournisseur.get(d.fournisseurId) ?? { fournisseur: d.fournisseur, documents: [], totalDu: 0, plusAncien: d.date, avances: 0 };
    g.documents.push({ id: d.id, type: d.type, numero: d.numero, date: d.date, montantTTC: d.montantTTC, timbre: d.timbre, fournisseurLibre: d.fournisseurLibre, ...s });
    g.totalDu = arrondi(g.totalDu + s.reste);
    if (d.date < g.plusAncien) g.plusAncien = d.date;
    parFournisseur.set(d.fournisseurId, g);
  }
  const avances = await prisma.reglementFournisseur.groupBy({
    by: ["fournisseurId"],
    where: { societeId: req.societeId, deletedAt: null, achatId: null, fournisseurId: { in: [...parFournisseur.keys()] } },
    _sum: { montant: true },
  });
  for (const a of avances) {
    const g = parFournisseur.get(a.fournisseurId);
    if (g) g.avances = arrondi(Number(a._sum.montant ?? 0));
  }
  res.json(
    [...parFournisseur.values()]
      .map((g) => ({ ...g, solde: arrondi(g.totalDu - g.avances) }))
      .sort((a, b) => b.totalDu - a.totalDu),
  );
});

const reglementSchema = z.object({
  fournisseurId: z.string().uuid(),
  achatId: z.string().uuid().optional().nullable(),
  montant: z.number().positive(),
  mode: z.enum(["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"]),
  reference: z.string().trim().max(120).optional().nullable(),
  date: z.coerce.date(),
  // Traite : échéance (par défaut un mois après la date du document, ou du règlement sans document).
  echeance: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

reglementsFournisseursRouter.post("/", async (req, res) => {
  const parsed = reglementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const fournisseur = await prisma.fournisseur.findFirst({ where: { id: d.fournisseurId, societeId: req.societeId, deletedAt: null }, select: { id: true } });
  if (!fournisseur) return res.status(404).json({ error: "Fournisseur introuvable" });
  let dateDocument: Date | null = null;
  if (d.achatId) {
    const a = await prisma.achat.findFirst({ where: { id: d.achatId, societeId: req.societeId, deletedAt: null } });
    if (a) dateDocument = a.date;
    if (!a || a.fournisseurId !== d.fournisseurId) return res.status(404).json({ error: "Document introuvable" });
    if (a.factureId) return res.status(409).json({ error: "Ce bon de livraison est facturé : réglez la facture." });
    const s = situation(a, await payesParAchat([a.id]));
    if (d.montant > s.reste + 0.0005) return res.status(409).json({ error: `Le montant dépasse le reste à payer (${s.reste.toFixed(3)} TND).` });
  }
  const r = await prisma.reglementFournisseur.create({
    data: {
      societeId: req.societeId!,
      fournisseurId: d.fournisseurId,
      achatId: d.achatId ?? null,
      montant: arrondi(d.montant),
      mode: d.mode,
      reference: d.reference || null,
      date: d.date,
      echeance: d.mode === "TRAITE" ? d.echeance ?? unMoisApres(dateDocument ?? d.date) : null,
      notes: d.notes || null,
    },
    include: { fournisseur: { select: FOURNISSEUR }, achat: { select: { id: true, type: true, numero: true } } },
  });
  res.status(201).json(r);
});

// Imputation des avances : l'argent déjà versé sans document est rattaché à des BL / factures. Les avances les plus
// anciennes partent en premier ; une avance utilisée en partie est coupée en deux (la part imputée garde son
// mode, sa référence et sa date ; le reste demeure une avance).
const imputationSchema = z.object({
  fournisseurId: z.string().uuid(),
  affectations: z.array(z.object({ achatId: z.string().uuid(), montant: z.number().positive() })).min(1).max(200),
});

reglementsFournisseursRouter.post("/imputer", async (req, res) => {
  const parsed = imputationSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { fournisseurId } = parsed.data;
  const affectations = parsed.data.affectations.map((x) => ({ ...x, montant: arrondi(x.montant) })).filter((x) => x.montant > 0);
  try {
    const resultat = await prisma.$transaction(async (tx) => {
      const avances = await tx.reglementFournisseur.findMany({
        where: { societeId: req.societeId, fournisseurId, achatId: null, deletedAt: null },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      });
      const disponible = arrondi(avances.reduce((t, a) => t + Number(a.montant), 0));
      const total = arrondi(affectations.reduce((t, a) => t + a.montant, 0));
      if (total > disponible + 0.0005) throw new Refus(`L'avance disponible est de ${disponible.toFixed(3)} TND.`);

      const docs = await tx.achat.findMany({ where: { id: { in: affectations.map((x) => x.achatId) }, societeId: req.societeId, deletedAt: null } });
      const payes = await payesParAchat(docs.map((d) => d.id));
      for (const x of affectations) {
        const d = docs.find((doc) => doc.id === x.achatId);
        if (!d || d.fournisseurId !== fournisseurId) throw new Refus("Document introuvable");
        if (d.factureId) throw new Refus(`Le BL ${d.numero} est facturé : imputez sur la facture.`);
        const reste = situation(d, payes).reste;
        if (x.montant > reste + 0.0005) throw new Refus(`${d.numero} : le montant dépasse le reste à payer (${reste.toFixed(3)} TND).`);
      }

      let i = 0;
      let restantAvance = avances.length ? Number(avances[0].montant) : 0;
      for (const x of affectations) {
        let besoin = x.montant;
        while (besoin > 0.0005 && i < avances.length) {
          const av = avances[i];
          const pris = arrondi(Math.min(besoin, restantAvance));
          if (pris >= restantAvance - 0.0005) {
            // L'avance (ou ce qui en reste) passe entière sur le document.
            await tx.reglementFournisseur.update({ where: { id: av.id }, data: { achatId: x.achatId, montant: arrondi(restantAvance) } });
            besoin = arrondi(besoin - restantAvance);
            i++;
            restantAvance = i < avances.length ? Number(avances[i].montant) : 0;
          } else {
            // Une partie seulement : la part imputée devient un règlement du document, le reste reste en avance.
            await tx.reglementFournisseur.create({
              data: {
                societeId: av.societeId,
                fournisseurId,
                achatId: x.achatId,
                montant: pris,
                mode: av.mode,
                reference: av.reference,
                date: av.date,
                echeance: av.echeance,
                compteBancaireId: av.compteBancaireId,
                notes: av.notes ? `${av.notes} (avance imputée)` : "Avance imputée",
              },
            });
            restantAvance = arrondi(restantAvance - pris);
            await tx.reglementFournisseur.update({ where: { id: av.id }, data: { montant: restantAvance } });
            besoin = 0;
          }
        }
      }
      return { impute: total, resteAvance: arrondi(disponible - total) };
    });
    res.json(resultat);
  } catch (err) {
    if (err instanceof Refus) return res.status(409).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

class Refus extends Error {}

reglementsFournisseursRouter.delete("/:id", async (req, res) => {
  await prisma.reglementFournisseur.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: { deletedAt: new Date() } });
  res.status(204).send();
});

// Chèque / traite imprimé : numéro du papier (devient la référence du règlement), compte tiré et valeurs imprimées.
const impressionSchema = z.object({
  reference: z.string().trim().max(120).optional().nullable(),
  compteBancaireId: z.string().uuid().optional().nullable(),
  echeance: z.coerce.date().optional().nullable(),
  impression: z.record(z.string().max(40), z.union([z.string().max(300), z.boolean(), z.null()])),
});

reglementsFournisseursRouter.post("/:id/impression", async (req, res) => {
  const parsed = impressionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const r = await prisma.reglementFournisseur.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!r) return res.status(404).json({ error: "Règlement introuvable" });
  if (r.mode !== "CHEQUE" && r.mode !== "TRAITE") return res.status(400).json({ error: "Seuls les chèques et les traites s'impriment." });
  const d = parsed.data;
  if (d.compteBancaireId && !(await prisma.compteBancaire.findFirst({ where: { id: d.compteBancaireId, societeId: req.societeId }, select: { id: true } }))) {
    return res.status(404).json({ error: "Compte introuvable" });
  }
  const maj = await prisma.reglementFournisseur.update({
    where: { id: r.id },
    data: {
      ...(d.reference ? { reference: d.reference } : {}),
      ...(d.compteBancaireId !== undefined ? { compteBancaireId: d.compteBancaireId } : {}),
      ...(r.mode === "TRAITE" && d.echeance ? { echeance: d.echeance } : {}),
      impression: d.impression,
      imprimeLe: new Date(),
    },
  });
  res.json(maj);
});
