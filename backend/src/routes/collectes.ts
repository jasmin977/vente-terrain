import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

/**
 * Collectes PDA : l'application « Collecte » envoie chaque liste d'articles scannés une fois terminée ;
 * le PC la télécharge dans un formulaire d'articles, puis elle est marquée importée (une seule fois).
 */
export const collectesRouter = Router();
collectesRouter.use(requireAuth, requireSociete);

/** Article de la société qui porte ce code (code-barres principal, code-barres secondaire ou code article). */
async function articlesParCode(societeId: string, codes: string[]) {
  const uniques = [...new Set(codes)];
  const res = new Map<string, { id: string; designation: string }>();
  if (uniques.length === 0) return res;
  const [principaux, secondaires] = await Promise.all([
    prisma.article.findMany({
      where: { societeId, deletedAt: null, OR: [{ codeBarre: { in: uniques } }, { code: { in: uniques } }] },
      select: { id: true, designation: true, codeBarre: true, code: true },
    }),
    prisma.codeBarreArticle.findMany({
      where: { societeId, codeBarre: { in: uniques }, article: { deletedAt: null } },
      select: { codeBarre: true, article: { select: { id: true, designation: true } } },
    }),
  ]);
  for (const s of secondaires) res.set(s.codeBarre, s.article);
  for (const a of principaux) {
    if (a.code && uniques.includes(a.code) && !res.has(a.code)) res.set(a.code, a);
    if (a.codeBarre && uniques.includes(a.codeBarre)) res.set(a.codeBarre, a);
  }
  return res;
}

const collecteSchema = z.object({
  nom: z.string().trim().max(120).optional().nullable(),
  lignes: z
    .array(z.object({ codeBarre: z.string().trim().min(1).max(64), quantite: z.number().positive() }))
    .min(1)
    .max(5000),
});

// PDA : envoie (ou renvoie, si le réseau a coupé) une collecte terminée. L'id vient du PDA : renvoyer la même
// collecte la remplace au lieu d'en créer une deuxième.
collectesRouter.put("/:id", async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const parsed = collecteSchema.safeParse(req.body);
  if (!id.success || !parsed.success) return res.status(400).json({ error: "Collecte invalide" });
  const existante = await prisma.collecte.findUnique({ where: { id: id.data } });
  if (existante && (existante.societeId !== req.societeId || existante.userId !== req.user!.id)) return res.status(404).json({ error: "Collecte introuvable" });
  if (existante?.importeeLe) return res.status(409).json({ error: "Cette collecte a déjà été importée sur le PC." });

  // Un même code scanné plusieurs fois : quantités additionnées.
  const parCode = new Map<string, number>();
  for (const l of parsed.data.lignes) parCode.set(l.codeBarre, (parCode.get(l.codeBarre) ?? 0) + l.quantite);
  const lignes = [...parCode.entries()].map(([codeBarre, quantite], ordre) => ({ codeBarre, quantite, ordre }));

  const collecte = await prisma.$transaction(async (tx) => {
    if (existante) await tx.ligneCollecte.deleteMany({ where: { collecteId: id.data } });
    return tx.collecte.upsert({
      where: { id: id.data },
      create: { id: id.data, societeId: req.societeId!, userId: req.user!.id, nom: parsed.data.nom || null, lignes: { create: lignes } },
      update: { nom: parsed.data.nom || null, termineeLe: new Date(), deletedAt: null, lignes: { create: lignes } },
    });
  });
  res.json({ id: collecte.id, nbLignes: lignes.length });
});

// PDA : mes collectes envoyées (et si elles ont été importées).
collectesRouter.get("/mes", async (req, res) => {
  const collectes = await prisma.collecte.findMany({
    where: { societeId: req.societeId, userId: req.user!.id, deletedAt: null },
    include: { _count: { select: { lignes: true } } },
    orderBy: { termineeLe: "desc" },
    take: 50,
  });
  res.json(collectes);
});

// PC : collectes reçues des appareils, les plus récentes d'abord.
collectesRouter.get("/", requireAdmin, async (req, res) => {
  const collectes = await prisma.collecte.findMany({
    // Toutes les collectes de la société, déjà importées ou non (elles se réimportent).
    where: { societeId: req.societeId, deletedAt: null },
    include: { user: { select: { id: true, nom: true, code: true } }, lignes: { select: { quantite: true } } },
    orderBy: { termineeLe: "desc" },
  });
  res.json(
    collectes.map(({ lignes, ...c }) => ({ ...c, nbLignes: lignes.length, totalQuantite: lignes.reduce((s, l) => s + Number(l.quantite), 0) })),
  );
});

// PC : le contenu d'une collecte, chaque code relié à son article (ou signalé inconnu).
collectesRouter.get("/:id", requireAdmin, async (req, res) => {
  const c = await prisma.collecte.findFirst({
    where: { id: req.params.id, societeId: req.societeId, deletedAt: null },
    include: { user: { select: { id: true, nom: true, code: true } }, lignes: { orderBy: { ordre: "asc" } } },
  });
  if (!c) return res.status(404).json({ error: "Collecte introuvable" });
  const articles = await articlesParCode(req.societeId!, c.lignes.map((l) => l.codeBarre));
  res.json({
    ...c,
    lignes: c.lignes.map((l) => ({
      codeBarre: l.codeBarre,
      quantite: Number(l.quantite),
      articleId: articles.get(l.codeBarre)?.id ?? null,
      designation: articles.get(l.codeBarre)?.designation ?? null,
    })),
  });
});

// PC : la collecte a été mise dans un formulaire. Elle reste proposée (réimportable autant de fois que voulu) :
// on garde seulement le dernier import et leur nombre. Seul l'appareil la supprime (Scan Stock).
collectesRouter.post("/:id/importee", requireAdmin, async (req, res) => {
  const destination = z.string().trim().max(120).optional().safeParse(req.body?.destination);
  const maj = await prisma.collecte.updateMany({
    where: { id: req.params.id, societeId: req.societeId, deletedAt: null },
    data: { importeeLe: new Date(), importeeDans: destination.success ? destination.data ?? null : null, nbImports: { increment: 1 } },
  });
  if (maj.count === 0) return res.status(404).json({ error: "Collecte introuvable" });
  res.json({ ok: true });
});
