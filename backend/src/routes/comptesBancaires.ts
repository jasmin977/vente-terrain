import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Comptes bancaires de la société : chèques et traites imprimés par l'app.
export const comptesBancairesRouter = Router();
comptesBancairesRouter.use(requireAuth, requireSociete, requireAdmin);

const texte = z.string().trim().max(160).optional().nullable().transform((v) => (v ? v : null));
const compteSchema = z.object({
  banque: z.string().trim().min(1).max(120),
  agence: texte,
  rib: z
    .string()
    .transform((v) => v.replace(/\s/g, ""))
    .refine((v) => /^\d{20}$/.test(v), "Le RIB compte 20 chiffres."),
  titulaire: texte,
  ville: texte,
  parDefaut: z.boolean().optional(),
});

// Gabarit d'impression : taille du papier, calage et position de chaque champ (mm).
const champSchema = z.object({
  x: z.number().min(-50).max(400),
  y: z.number().min(-50).max(400),
  largeur: z.number().min(1).max(300),
  hauteur: z.number().min(1).max(300),
  taille: z.number().min(5).max(24),
  alignement: z.enum(["gauche", "centre", "droite"]).optional(),
  lignes: z.number().int().min(1).max(8).optional(),
  espacement: z.number().min(0).max(10).optional(),
  gras: z.boolean().optional(),
  masque: z.boolean().optional(),
});
const gabaritSchema = z.object({
  version: z.number().int().optional(),
  largeur: z.number().min(50).max(300),
  hauteur: z.number().min(30).max(300),
  papier: z.enum(["EFFET", "A4"]),
  decalageX: z.number().min(-50).max(50),
  decalageY: z.number().min(-50).max(50),
  rotation: z.boolean().optional(),
  fond: z.string().max(500).optional().nullable(),
  champs: z.record(z.string().max(40), champSchema),
});

const SELECT = { id: true, banque: true, agence: true, rib: true, titulaire: true, ville: true, parDefaut: true, gabarits: true } as const;

comptesBancairesRouter.get("/", async (req, res) => {
  const comptes = await prisma.compteBancaire.findMany({
    where: { societeId: req.societeId, deletedAt: null },
    select: SELECT,
    orderBy: [{ parDefaut: "desc" }, { createdAt: "asc" }],
  });
  res.json(comptes);
});

comptesBancairesRouter.post("/", async (req, res) => {
  const parsed = compteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Compte invalide" });
  const societeId = req.societeId!;
  const compte = await prisma.$transaction(async (tx) => {
    // Le premier compte devient le compte par défaut.
    const premier = (await tx.compteBancaire.count({ where: { societeId, deletedAt: null } })) === 0;
    const parDefaut = premier || Boolean(parsed.data.parDefaut);
    if (parDefaut) await tx.compteBancaire.updateMany({ where: { societeId }, data: { parDefaut: false } });
    return tx.compteBancaire.create({ data: { ...parsed.data, societeId, parDefaut }, select: SELECT });
  });
  res.status(201).json(compte);
});

comptesBancairesRouter.put("/:id", async (req, res) => {
  const parsed = compteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Compte invalide" });
  const societeId = req.societeId!;
  const existant = await prisma.compteBancaire.findFirst({ where: { id: req.params.id, societeId, deletedAt: null } });
  if (!existant) return res.status(404).json({ error: "Compte introuvable" });
  const compte = await prisma.$transaction(async (tx) => {
    if (parsed.data.parDefaut) await tx.compteBancaire.updateMany({ where: { societeId }, data: { parDefaut: false } });
    return tx.compteBancaire.update({ where: { id: existant.id }, data: { ...parsed.data, parDefaut: parsed.data.parDefaut ?? existant.parDefaut }, select: SELECT });
  });
  res.json(compte);
});

// Réglage de l'impression des chèques ou des traites de ce compte.
comptesBancairesRouter.put("/:id/gabarit/:type", async (req, res) => {
  const type = z.enum(["CHEQUE", "TRAITE"]).safeParse(req.params.type);
  const parsed = gabaritSchema.safeParse(req.body);
  if (!type.success || !parsed.success) return res.status(400).json({ error: "Réglage invalide" });
  const existant = await prisma.compteBancaire.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!existant) return res.status(404).json({ error: "Compte introuvable" });
  const gabarits = { ...((existant.gabarits as Prisma.JsonObject | null) ?? {}), [type.data]: parsed.data } as Prisma.InputJsonObject;
  const compte = await prisma.compteBancaire.update({ where: { id: existant.id }, data: { gabarits }, select: SELECT });
  res.json(compte);
});

comptesBancairesRouter.delete("/:id", async (req, res) => {
  const existant = await prisma.compteBancaire.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!existant) return res.status(404).json({ error: "Compte introuvable" });
  await prisma.compteBancaire.update({ where: { id: existant.id }, data: { deletedAt: new Date(), parDefaut: false } });
  if (existant.parDefaut) {
    const suivant = await prisma.compteBancaire.findFirst({ where: { societeId: req.societeId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (suivant) await prisma.compteBancaire.update({ where: { id: suivant.id }, data: { parDefaut: true } });
  }
  res.status(204).send();
});
