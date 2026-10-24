import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { fournisseurDivers, soldesFournisseurs } from "../services/achatService";

/** Achats › Fournisseurs : liste (avec ce qu'on leur doit), création, modification, suppression. */
export const fournisseursRouter = Router();
fournisseursRouter.use(requireAuth, requireSociete, requireAdmin);

const texte = z.string().trim().max(200).optional().nullable().transform((v) => (v ? v : null));
const fournisseurSchema = z.object({
  nom: z.string().trim().min(1).max(160),
  matriculeFiscal: texte,
  telephone: texte,
  email: texte,
  adresse: texte,
  ville: texte,
  contact: texte,
  notes: z.string().trim().max(2000).optional().nullable().transform((v) => (v ? v : null)),
});

fournisseursRouter.get("/", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  // « Divers » existe toujours et arrive en tête (ref 0).
  await fournisseurDivers(req.societeId!);
  const fournisseurs = await prisma.fournisseur.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { nom: { contains: q, mode: "insensitive" } },
              { matriculeFiscal: { contains: q, mode: "insensitive" } },
              { ville: { contains: q, mode: "insensitive" } },
              ...(/^\d+$/.test(q) && q.length < 9 ? [{ ref: Number(q) }] : []),
            ],
          }
        : {}),
    },
    orderBy: { ref: "asc" },
  });
  const soldes = await soldesFournisseurs(req.societeId!, fournisseurs.map((f) => f.id));
  res.json(fournisseurs.map((f) => ({ ...f, ...(soldes.get(f.id) ?? { du: 0, nbImpayes: 0, avances: 0, solde: 0 }) })));
});

fournisseursRouter.get("/:id", async (req, res) => {
  const f = await prisma.fournisseur.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!f) return res.status(404).json({ error: "Fournisseur introuvable" });
  const soldes = await soldesFournisseurs(req.societeId!, [f.id]);
  res.json({ ...f, ...(soldes.get(f.id) ?? { du: 0, nbImpayes: 0, avances: 0, solde: 0 }) });
});

fournisseursRouter.post("/", async (req, res) => {
  const parsed = fournisseurSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  // ref = max + 1 dans la société ; on réessaie si deux créations simultanées se croisent.
  for (let essai = 0; ; essai++) {
    try {
      const dernier = await prisma.fournisseur.aggregate({ where: { societeId: req.societeId }, _max: { ref: true } });
      const f = await prisma.fournisseur.create({ data: { ...parsed.data, societeId: req.societeId!, ref: (dernier._max.ref ?? 0) + 1 } });
      return res.status(201).json(f);
    } catch (err) {
      const conflit = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (conflit && essai < 4) continue;
      throw err;
    }
  }
});

fournisseursRouter.put("/:id", async (req, res) => {
  const parsed = fournisseurSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const maj = await prisma.fournisseur.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null, divers: false }, data: parsed.data });
  if (maj.count === 0) return res.status(404).json({ error: "Fournisseur introuvable" });
  res.json(await prisma.fournisseur.findUnique({ where: { id: req.params.id } }));
});

// Suppression logique, refusée tant que le fournisseur a des achats ou des règlements (l'historique reste lisible).
fournisseursRouter.delete("/:id", async (req, res) => {
  const f = await prisma.fournisseur.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, select: { id: true, divers: true } });
  if (!f) return res.status(204).send();
  if (f.divers) return res.status(409).json({ error: "Le fournisseur « Divers » est intégré : il ne peut pas être supprimé." });
  const [achats, reglements] = await Promise.all([
    prisma.achat.count({ where: { fournisseurId: f.id, deletedAt: null } }),
    prisma.reglementFournisseur.count({ where: { fournisseurId: f.id, deletedAt: null } }),
  ]);
  if (achats + reglements > 0) return res.status(409).json({ error: "Ce fournisseur a des achats ou des règlements : il ne peut pas être supprimé." });
  await prisma.fournisseur.update({ where: { id: f.id }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
