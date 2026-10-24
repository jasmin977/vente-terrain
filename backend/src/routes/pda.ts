import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";

/**
 * Scan Stock, l'app des employés du dépôt : pas de compte. Ces routes ne répondent qu'aux appareils du réseau
 * local (Wi-Fi du dépôt) et n'exposent que ce que le scan demande : le nom des sociétés, les articles (nom et
 * codes, sans prix) et l'envoi des collectes. Chaque société reçoit ses propres collectes.
 */
export const pdaRouter = Router();

const APPAREIL = "Scan Stock";

/** Adresse du réseau local : 10.x, 172.16–31.x, 192.168.x, 169.254.x, la machine elle-même. */
export function adresseLocale(ip: string | undefined): boolean {
  if (!ip) return false;
  const v4 = ip.replace(/^::ffff:/, "");
  if (v4 === "::1" || v4 === "127.0.0.1") return true;
  const p = v4.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
}

function reseauLocal(req: Request, res: Response, next: NextFunction) {
  if (!adresseLocale(req.socket.remoteAddress)) return res.status(403).json({ error: "Scan Stock fonctionne seulement sur le Wi-Fi du dépôt." });
  next();
}
pdaRouter.use(reseauLocal);

async function societeOu404(req: Request, res: Response) {
  const societe = await prisma.societe.findFirst({ where: { id: req.params.societeId, deletedAt: null }, select: { id: true, nom: true } });
  if (!societe) res.status(404).json({ error: "Société introuvable" });
  return societe;
}

// Les sociétés (nom seulement) : l'employé choisit la sienne dans le menu de l'app.
pdaRouter.get("/societes", async (_req, res) => {
  res.json(await prisma.societe.findMany({ where: { deletedAt: null }, select: { id: true, nom: true }, orderBy: { nom: "asc" } }));
});

// Catalogue pour reconnaître les codes scannés : désignation et codes, sans aucun prix.
pdaRouter.get("/:societeId/articles", async (req, res) => {
  const societe = await societeOu404(req, res);
  if (!societe) return;
  const articles = await prisma.article.findMany({
    where: { societeId: societe.id, deletedAt: null },
    select: { id: true, designation: true, code: true, codeBarre: true, codesBarres: { select: { codeBarre: true } } },
  });
  res.json(articles);
});

const collecteSchema = z.object({
  nom: z.string().trim().max(120).optional().nullable(),
  lignes: z
    .array(z.object({ codeBarre: z.string().trim().min(1).max(64), quantite: z.number().positive() }))
    .min(1)
    .max(5000),
});

// Envoi (ou renvoi après une coupure) d'une collecte terminée : l'id vient de l'appareil, renvoyer la remplace.
pdaRouter.put("/:societeId/collectes/:id", async (req, res) => {
  const societe = await societeOu404(req, res);
  if (!societe) return;
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = collecteSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: "Collecte invalide" });
  const existante = await prisma.collecte.findUnique({ where: { id: id.data } });
  if (existante && existante.societeId !== societe.id) return res.status(404).json({ error: "Collecte introuvable" });

  // Un même code scanné plusieurs fois : quantités additionnées.
  const parCode = new Map<string, number>();
  for (const l of parsed.data.lignes) parCode.set(l.codeBarre, (parCode.get(l.codeBarre) ?? 0) + l.quantite);
  const lignes = [...parCode.entries()].map(([codeBarre, quantite], ordre) => ({ codeBarre, quantite, ordre }));

  const collecte = await prisma.$transaction(async (tx) => {
    if (existante) await tx.ligneCollecte.deleteMany({ where: { collecteId: id.data } });
    return tx.collecte.upsert({
      where: { id: id.data },
      create: { id: id.data, societeId: societe.id, appareil: APPAREIL, nom: parsed.data.nom || null, lignes: { create: lignes } },
      update: { nom: parsed.data.nom || null, termineeLe: new Date(), deletedAt: null, lignes: { create: lignes } },
    });
  });
  res.json({ id: collecte.id, nbLignes: lignes.length });
});

// État des collectes de l'appareil (importées sur le PC ou en attente) : l'appareil donne leurs ids.
pdaRouter.post("/:societeId/collectes/etat", async (req, res) => {
  const societe = await societeOu404(req, res);
  if (!societe) return;
  const ids = z.array(z.string().uuid()).max(200).safeParse(req.body?.ids);
  if (!ids.success) return res.status(400).json({ error: "Liste invalide" });
  const collectes = await prisma.collecte.findMany({
    where: { id: { in: ids.data }, societeId: societe.id },
    select: { id: true, nom: true, termineeLe: true, importeeLe: true, importeeDans: true, nbImports: true, deletedAt: true, _count: { select: { lignes: true } } },
  });
  res.json(collectes);
});

// Suppression : seulement depuis l'appareil (le PC ne supprime pas les collectes).
pdaRouter.delete("/:societeId/collectes/:id", async (req, res) => {
  const societe = await societeOu404(req, res);
  if (!societe) return;
  await prisma.collecte.updateMany({ where: { id: req.params.id, societeId: societe.id, deletedAt: null }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
