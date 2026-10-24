import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ORDRE_CATALOGUE } from "../lib/ordreArticles";
import { noterPrix } from "../lib/historiquePrix";
import { dateExpirationSchema } from "../lib/lotsDepot";
import { ttcDepuisHT } from "../lib/tarifs";
import { ErreurImport, importerArticles, modeleArticles } from "../services/importArticles";
import { codeBarreValide, ErreurPhotoTemporaire, infosProduit, marqueDansDesignation, sourcesPour } from "../services/photosEnLigne";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

export const articlesRouter = Router();
articlesRouter.use(requireAuth, requireSociete);

const codeDejaPris = (err: unknown) =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
const REF_DEJA_PRISE = "Cette référence existe déjà dans la société";

async function ordreSuivant(societeId: string) {
  const { _max } = await prisma.article.aggregate({
    where: { societeId },
    _max: { ordre: true },
  });
  return (_max.ordre ?? 0) + 1;
}

// Module 1 - Gestion des Articles : recherche sur désignation, marque, unité,
// référence et code-barres. Chaque mot saisi doit se retrouver dans l'un de ces
// champs (« cire orange » trouve « CIRE-WAX ORANGE »).
const CHAMPS_RECHERCHE = [
  "designation",
  "marque",
  "unit",
  "code",
  "codeBarre",
] as const;
articlesRouter.get("/", async (req, res) => {
  const { q, codeBarre } = req.query as Record<string, string | undefined>;

  const articles = await prisma.article.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(codeBarre ? { OR: [{ codeBarre }, { codesBarres: { some: { codeBarre } } }] } : {}),
      ...(q?.trim()
        ? {
            AND: q
              .trim()
              .split(/\s+/)
              .map((mot) => ({
                OR: [
                  ...CHAMPS_RECHERCHE.map((champ) => ({
                    [champ]: { contains: mot, mode: "insensitive" as const },
                  })),
                  // Codes-barres alternatifs et variantes.
                  {
                    codesBarres: {
                      some: {
                        OR: [
                          { codeBarre: { contains: mot, mode: "insensitive" as const } },
                          { libelle: { contains: mot, mode: "insensitive" as const } },
                        ],
                      },
                    },
                  },
                ],
              })),
          }
        : {}),
    },
    include: { codesBarres: { select: { id: true, codeBarre: true, libelle: true }, orderBy: { createdAt: "asc" } } },
    orderBy: ORDRE_CATALOGUE,
    take: 5000,
  });
  res.json(articles);
});

/* ---------------------------------------------------------------- Photos en ligne */

// Articles sans photo dont la recherche automatique n'a pas encore été faite (admin).
articlesRouter.get("/photos-a-chercher", requireAdmin, async (req, res) => {
  const articles = await prisma.article.findMany({
    where: { societeId: req.societeId, deletedAt: null, photoCherchee: null, OR: [{ img: null }, { img: "" }], codeBarre: { not: null } },
    select: { id: true, codeBarre: true },
    orderBy: ORDRE_CATALOGUE,
  });
  res.json({ ids: articles.filter((a) => codeBarreValide(a.codeBarre)).map((a) => a.id) });
});

// Informations d'un produit à partir de son code-barres (création d'article) : nom, marque, contenance, photo.
articlesRouter.get("/infos-code-barre", requireAdmin, async (req, res) => {
  const code = String(req.query.code ?? "").trim();
  if (!codeBarreValide(code)) return res.json({ infos: null });
  try {
    res.json({ infos: await infosProduit(code) });
  } catch (err) {
    if (err instanceof ErreurPhotoTemporaire) return res.status(503).json({ error: "Bases en ligne injoignables pour le moment" });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

const photosSchema = z.object({ articleIds: z.array(z.string().uuid()).min(1).max(8) });

// Cherche la photo de quelques articles (par lots : l'appli enchaîne les appels). Par article :
// « trouvee » (lien enregistré), « absente » (aucune base ne la connaît : notée, pas redemandée),
// « erreur » / « ignoree » (à réessayer).
articlesRouter.post("/photos-trouver", requireAdmin, async (req, res) => {
  const parsed = photosSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Données invalides" });
  const limite = Date.now() + 22_000; // Vercel coupe à 30 s
  const resultats: { id: string; statut: "trouvee" | "absente" | "erreur" | "ignoree"; img?: string }[] = [];
  try {
    const articles = await prisma.article.findMany({
      where: { id: { in: parsed.data.articleIds }, societeId: req.societeId, deletedAt: null },
      include: { categorie: { select: { nom: true, parent: { select: { nom: true } } } } },
    });
    for (const a of articles) {
      if (Date.now() > limite) {
        resultats.push({ id: a.id, statut: "ignoree" });
        continue;
      }
      if (!codeBarreValide(a.codeBarre) || a.img) {
        resultats.push({ id: a.id, statut: "absente" });
        continue;
      }
      let infos: Awaited<ReturnType<typeof infosProduit>> = null;
      let erreur = false;
      try {
        infos = await infosProduit(a.codeBarre, sourcesPour(a.categorie?.parent?.nom ?? a.categorie?.nom), 700);
      } catch (err) {
        if (!(err instanceof ErreurPhotoTemporaire)) throw err;
        erreur = true;
      }
      if (erreur) {
        resultats.push({ id: a.id, statut: "erreur" });
        continue;
      }
      // Seuls les champs vides sont complétés : la marque et l'unité déjà saisies ne sont jamais changées.
      // La marque n'est reprise que si elle figure déjà dans la désignation (sinon c'est souvent le groupe).
      const donnees: { img?: string; marque?: string; unit?: string; photoCherchee: Date } = { photoCherchee: new Date() };
      if (infos?.img) donnees.img = infos.img;
      if (infos?.quantite && !a.unit?.trim()) donnees.unit = infos.quantite.toUpperCase();
      if (infos?.marque && !a.marque?.trim() && marqueDansDesignation(infos.marque, a.designation)) donnees.marque = infos.marque.toUpperCase();
      await prisma.article.update({ where: { id: a.id }, data: donnees });
      resultats.push(donnees.img ? { id: a.id, statut: "trouvee", img: donnees.img } : { id: a.id, statut: "absente" });
    }
    res.json({ resultats });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// La société utilise-t-elle les références (Réf) ? Sinon la fiche article n'affiche pas ce champ.
articlesRouter.get("/references-utilisees", async (req, res) => {
  const n = await prisma.article.count({ where: { societeId: req.societeId, deletedAt: null, code: { not: null } } });
  res.json({ utilisee: n > 0 });
});

/* ---------------------------------------------------------------- Import Excel */

/** Modèle à remplir (une ligne d'exemple). */
articlesRouter.get("/modele", requireAdmin, async (_req, res) => {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modele-articles.xlsx"');
  res.send(await modeleArticles());
});

const importSchema = z.object({ fichier: z.string().min(1) }); // .xlsx en base64

articlesRouter.post("/import", requireAdmin, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Fichier manquant" });
  try {
    res.json(await importerArticles(parsed.data.fichier, req.societeId!, req.user!.id));
  } catch (err) {
    if (err instanceof ErreurImport) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: "Import impossible : erreur serveur" });
  }
});

/* ---------------------------------------------------------------- Fiche article */

articlesRouter.get("/:id", async (req, res) => {
  const admin = req.user?.role === "ADMIN";
  const article = await prisma.article.findFirst({
    where: { id: req.params.id, societeId: req.societeId },
    // Quantité au dépôt : réservée à l'admin.
    include: {
      codesBarres: { select: { id: true, codeBarre: true, libelle: true }, orderBy: { createdAt: "asc" } },
      ...(admin ? { stockDepot: { select: { quantite: true } } } : {}),
    },
  });
  if (!article) return res.status(404).json({ error: "Article introuvable" });
  if (!admin) return res.json(article);
  const { stockDepot, ...fiche } = article as typeof article & { stockDepot: { quantite: unknown } | null };
  res.json({ ...fiche, stockDepot: Number(stockDepot?.quantite ?? 0) });
});

// Réf facultative (vide = aucune), code-barres obligatoire.
const texteOuNull = z
  .string()
  .nullish()
  .transform((s) => (s?.trim() ? s.trim() : null));
const articleSchema = z.object({
  code: texteOuNull,
  codeBarre: z.string().trim().min(1, "Le code-barres est obligatoire"),
  designation: z.string().min(1),
  marque: z.string().optional(),
  unit: z.string().optional(),
  // Lien (http…) vers la photo ; « /uploads/… » pour les anciennes photos envoyées sur le serveur.
  img: z
    .string()
    .max(2000)
    .refine((v) => v === "" || /^https?:\/\//i.test(v) || v.startsWith("/uploads/"), "Lien d'image invalide")
    .optional(),
  prixAchat: z.number().nonnegative(),
  prixVente: z.number().nonnegative(),
  colisage: z.number().int().positive().default(1),
  tva: z.number().min(0).max(100).default(19),
  // FODEC en % du prix HT (0 ou 1) ; prix de gros HT facultatif.
  fodec: z.number().min(0).max(100).optional(),
  prixGros: z.number().nonnegative().nullable().optional(),
  // Catégorie (facultative : un article créé sans catégorie est signalé « à classer »).
  categorieId: z.string().uuid().nullable().optional(),
  // Exclu du suivi des dates d'expiration.
  sansPeremption: z.boolean().optional(),
  // Stock minimum en pièces, saisi en colis dans l'app (null : 5 colis) et mise en avant, jusqu'à une date (AAAA-MM-JJ, null : sans fin).
  stockMini: z.number().positive().nullable().optional(),
  etiquette: z.enum(["NOUVEAU", "PROMOTION"]).nullable().optional(),
  etiquetteJusqua: dateExpirationSchema.nullable().optional(),
  // Autres codes-barres du produit (variantes) ; à la modification, la liste remplace l'ancienne.
  codesBarres: z
    .array(z.object({ codeBarre: z.string().trim().min(1).max(64), libelle: z.string().trim().max(60).nullish() }))
    .max(40)
    .optional(),
});

/**
 * Les codes-barres d'un article (principal + variantes) ne doivent être ceux d'aucun autre article de la société.
 * Retourne le message d'erreur, ou null.
 */
async function verifierCodesBarres(
  societeId: string,
  articleId: string | null,
  principal: string | undefined,
  alternatifs: { codeBarre: string }[] | undefined,
) {
  const codes = [...(principal ? [principal] : []), ...(alternatifs ?? []).map((c) => c.codeBarre)];
  if (new Set(codes).size !== codes.length) return "Un code-barres est saisi deux fois sur cet article";
  if (codes.length === 0) return null;
  const [autreArticle, autreCode] = await Promise.all([
    prisma.article.findFirst({
      where: { societeId, deletedAt: null, codeBarre: { in: codes }, ...(articleId ? { id: { not: articleId } } : {}) },
      select: { codeBarre: true, designation: true },
    }),
    prisma.codeBarreArticle.findFirst({
      where: { societeId, codeBarre: { in: codes }, ...(articleId ? { articleId: { not: articleId } } : {}), article: { deletedAt: null } },
      select: { codeBarre: true, article: { select: { designation: true } } },
    }),
  ]);
  const pris = autreArticle
    ? { code: autreArticle.codeBarre, nom: autreArticle.designation }
    : autreCode
      ? { code: autreCode.codeBarre, nom: autreCode.article.designation }
      : null;
  return pris ? `Le code-barres ${pris.code} appartient déjà à « ${pris.nom} »` : null;
}

/** Catégorie d'un article saisi à la main : facultative, mais elle doit appartenir à la société. */
async function verifierCategorie(societeId: string, categorieId: string | null | undefined) {
  if (!categorieId) return null;
  const cat = await prisma.categorie.findFirst({ where: { id: categorieId, societeId }, select: { id: true } });
  return cat ? null : "Catégorie introuvable";
}

articlesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = articleSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const refus = await verifierCategorie(req.societeId!, parsed.data.categorieId);
    if (refus) return res.status(400).json({ error: refus });
    const { codesBarres, ...donnees } = parsed.data;
    const conflit = await verifierCodesBarres(req.societeId!, null, donnees.codeBarre, codesBarres);
    if (conflit) return res.status(409).json({ error: conflit });
    const article = await prisma.$transaction(async (tx) => {
      const cree = await tx.article.create({
        data: {
          ...donnees,
          societeId: req.societeId!,
          ordre: await ordreSuivant(req.societeId!),
          ...(codesBarres?.length
            ? { codesBarres: { create: codesBarres.map((c) => ({ societeId: req.societeId!, codeBarre: c.codeBarre, libelle: c.libelle || null })) } }
            : {}),
        },
        include: { codesBarres: { select: { id: true, codeBarre: true, libelle: true } } },
      });
      await noterPrix(tx, cree.id, cree, null, "CREATION", { adminId: req.user!.id });
      return cree;
    });
    res.status(201).json(article);
  } catch (err) {
    if (codeDejaPris(err))
      return res.status(409).json({ error: REF_DEJA_PRISE });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

articlesRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = articleSchema.partial().safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const refus = await verifierCategorie(req.societeId!, parsed.data.categorieId);
    if (refus) return res.status(400).json({ error: refus });
    const avant = await prisma.article.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
    if (!avant) return res.status(404).json({ error: "Article introuvable" });
    const { codesBarres, ...donnees } = parsed.data;
    if (codesBarres !== undefined || donnees.codeBarre !== undefined) {
      const alternatifs =
        codesBarres ?? (await prisma.codeBarreArticle.findMany({ where: { articleId: avant.id }, select: { codeBarre: true } }));
      const conflit = await verifierCodesBarres(req.societeId!, avant.id, donnees.codeBarre ?? avant.codeBarre ?? undefined, alternatifs);
      if (conflit) return res.status(409).json({ error: conflit });
    }
    const apres = await prisma.$transaction(async (tx) => {
      if (codesBarres !== undefined) {
        await tx.codeBarreArticle.deleteMany({ where: { articleId: avant.id } });
        if (codesBarres.length) {
          await tx.codeBarreArticle.createMany({
            data: codesBarres.map((c) => ({ articleId: avant.id, societeId: req.societeId!, codeBarre: c.codeBarre, libelle: c.libelle || null })),
          });
        }
      }
      const maj = await tx.article.update({
        where: { id: avant.id },
        data: donnees,
        include: { codesBarres: { select: { id: true, codeBarre: true, libelle: true } } },
      });
      await noterPrix(tx, avant.id, maj, avant, "MODIFICATION", { adminId: req.user!.id });
      return maj;
    });
    res.json(apres);
  } catch (err) {
    if (codeDejaPris(err))
      return res.status(409).json({ error: REF_DEJA_PRISE });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Historique des prix d'un article (admin) : du plus ancien au plus récent, en HT et TTC.
articlesRouter.get("/:id/prix-historique", requireAdmin, async (req, res) => {
  try {
    const article = await prisma.article.findFirst({ where: { id: req.params.id, societeId: req.societeId }, select: { id: true } });
    if (!article) return res.status(404).json({ error: "Article introuvable" });
    const lignes = await prisma.historiquePrix.findMany({ where: { articleId: article.id }, orderBy: { date: "asc" } });
    const entrees = await prisma.entreeDepot.findMany({
      where: { id: { in: lignes.flatMap((l) => (l.entreeId ? [l.entreeId] : [])) } },
      select: { id: true, reference: true },
    });
    const reference = new Map(entrees.map((e) => [e.id, e.reference]));
    res.json(
      lignes.map((l) => {
        const achat = Number(l.prixAchat);
        const ht = Number(l.prixVente);
        return {
          id: l.id,
          date: l.date,
          source: l.source,
          reference: l.entreeId ? (reference.get(l.entreeId) ?? null) : null,
          prixAchat: achat,
          prixVenteHT: ht,
          prixVenteTTC: ttcDepuisHT(ht, Number(l.tva), Number(l.fodec)),
          marge: achat > 0 ? Math.round((ht / achat - 1) * 10000) / 100 : null,
        };
      }),
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

articlesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.article.updateMany({
    where: { id: req.params.id, societeId: req.societeId },
    data: { deletedAt: new Date() },
  });
  // Les codes-barres alternatifs sont libérés pour d'autres articles.
  await prisma.codeBarreArticle.deleteMany({ where: { articleId: req.params.id, societeId: req.societeId } });
  res.status(204).send();
});
