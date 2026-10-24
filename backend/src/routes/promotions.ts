import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Commercial › Promotions : prix promo sur une période, ou vente en lot. Une promotion « active » s'applique
// d'elle-même sur les BL de vente (PC et application des vendeurs) entre sa date de début et sa date de fin.
export const promotionsRouter = Router();
promotionsRouter.use(requireAuth, requireSociete);

const MODES = ["CADEAU", "UN_PLUS_UN", "DEUXIEME_MOITIE", "N_PLUS_UN", "PRIX_LOT"] as const;
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const enDate = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const aujourdhui = () => {
  const d = new Date();
  return enDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
};

const ligneSchema = z.object({
  articleId: z.string().uuid(),
  prixPromo: z.number().positive().optional().nullable(),
  articleOffertId: z.string().uuid().optional().nullable(),
  quantiteOfferte: z.number().positive().optional().nullable(),
  seuil: z.number().int().min(1).max(1000).optional().nullable(),
  tailleLot: z.number().int().min(2).max(10000).optional().nullable(),
  prixLot: z.number().positive().optional().nullable(),
});

const promotionSchema = z
  .object({
    type: z.enum(["PRIX", "LOT"]),
    mode: z.enum(MODES).optional().nullable(),
    libelle: z.string().trim().max(160).optional().nullable(),
    dateDebut: jour,
    dateFin: jour,
    lignes: z.array(ligneSchema).min(1).max(1000),
  })
  .superRefine((p, ctx) => {
    if (p.dateFin < p.dateDebut) ctx.addIssue({ code: "custom", message: "La date de fin est avant la date de début." });
    if (p.type === "LOT" && !p.mode) ctx.addIssue({ code: "custom", message: "Choisissez le mode de la vente en lot." });
    const ids = p.lignes.map((l) => l.articleId);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Un article est en double dans la liste." });
    for (const l of p.lignes) {
      const manque =
        p.type === "PRIX"
          ? !l.prixPromo && "le prix promo"
          : p.mode === "CADEAU"
            ? (!l.articleOffertId || !l.quantiteOfferte) && "l'article offert et sa quantité"
            : p.mode === "N_PLUS_UN"
              ? !l.seuil && "le nombre de pièces achetées (N)"
              : p.mode === "PRIX_LOT"
                ? (!l.tailleLot || !l.prixLot) && "la taille et le prix du lot"
                : false;
      if (manque) ctx.addIssue({ code: "custom", message: `Il manque ${manque} sur une ligne.` });
    }
  });

const INCLURE = {
  lignes: {
    orderBy: { ordre: "asc" },
    include: {
      article: { select: { id: true, designation: true, codeBarre: true, prixAchat: true, prixVente: true, tva: true, fodec: true, colisage: true, img: true } },
      articleOffert: { select: { id: true, designation: true, codeBarre: true, prixAchat: true, prixVente: true, tva: true, fodec: true } },
    },
  },
} satisfies Prisma.PromotionInclude;

type PromotionComplete = Prisma.PromotionGetPayload<{ include: typeof INCLURE }>;

const statutDe = (p: { dateDebut: Date; dateFin: Date }) => {
  const j = aujourdhui();
  return p.dateFin < j ? "TERMINEE" : p.dateDebut > j ? "A_VENIR" : "EN_COURS";
};
const texteDate = (d: Date) => d.toISOString().slice(0, 10);

function serialiser(p: PromotionComplete) {
  return {
    ...p,
    dateDebut: texteDate(p.dateDebut),
    dateFin: texteDate(p.dateFin),
    statut: statutDe(p),
    lignes: p.lignes.map((l) => ({
      ...l,
      prixPromo: l.prixPromo === null ? null : Number(l.prixPromo),
      quantiteOfferte: l.quantiteOfferte === null ? null : Number(l.quantiteOfferte),
      prixLot: l.prixLot === null ? null : Number(l.prixLot),
    })),
  };
}

/** Numéro suivant : PR-26/0001 (prix) ou LT-26/0001 (lot), par société et par année. */
async function prochainNumero(tx: Prisma.TransactionClient, societeId: string, type: "PRIX" | "LOT", annee: number) {
  const prefixe = `${type === "PRIX" ? "PR" : "LT"}-${String(annee).slice(-2)}/`;
  let n = (await tx.promotion.count({ where: { societeId, numero: { startsWith: prefixe } } })) + 1;
  for (;;) {
    const numero = `${prefixe}${String(n).padStart(4, "0")}`;
    if (!(await tx.promotion.findFirst({ where: { societeId, numero }, select: { id: true } }))) return numero;
    n++;
  }
}

/** Un article ne peut être que dans une seule promotion à la fois : message de la première qui chevauche. */
async function chevauchement(societeId: string, debut: Date, fin: Date, articleIds: string[], sauf?: string) {
  const conflit = await prisma.promotionLigne.findFirst({
    where: {
      articleId: { in: articleIds },
      promotion: { societeId, deletedAt: null, dateDebut: { lte: fin }, dateFin: { gte: debut }, ...(sauf ? { id: { not: sauf } } : {}) },
    },
    include: { article: { select: { designation: true } }, promotion: { select: { numero: true, dateDebut: true, dateFin: true } } },
  });
  if (!conflit) return null;
  const p = conflit.promotion;
  return `« ${conflit.article.designation} » est déjà dans la promotion ${p.numero} (du ${texteDate(p.dateDebut).split("-").reverse().join("/")} au ${texteDate(p.dateFin).split("-").reverse().join("/")}).`;
}

// Promotions valables à une date (par défaut aujourd'hui) et celles qui commencent dans la semaine : les BL les
// appliquent, l'application des vendeurs les garde pour travailler hors ligne.
/** Promotions en cours ou qui commencent dans les 7 jours (appareils hors ligne : vendeurs, caisses). */
export async function promotionsActives(societeId: string, avecPrixAchat: boolean) {
  const j = aujourdhui();
  const dans7 = new Date(j.getTime() + 7 * 86_400_000);
  const promos = await prisma.promotion.findMany({
    where: { societeId, deletedAt: null, dateFin: { gte: j }, dateDebut: { lte: dans7 } },
    include: INCLURE,
    orderBy: { dateDebut: "asc" },
  });
  const liste = promos.map(serialiser);
  // Vendeurs et caisses : jamais le prix d'achat (comme pour le catalogue).
  if (!avecPrixAchat) {
    for (const p of liste)
      for (const l of p.lignes) {
        (l.article as { prixAchat?: unknown }).prixAchat = undefined;
        if (l.articleOffert) (l.articleOffert as { prixAchat?: unknown }).prixAchat = undefined;
      }
  }
  return liste;
}

promotionsRouter.get("/actives", async (req, res) => {
  res.json(await promotionsActives(req.societeId!, req.user!.role === "ADMIN"));
});

promotionsRouter.get("/", requireAdmin, async (req, res) => {
  const promos = await prisma.promotion.findMany({
    where: { societeId: req.societeId, deletedAt: null },
    include: INCLURE,
    orderBy: [{ dateDebut: "desc" }, { createdAt: "desc" }],
    take: 500,
  });
  const evolutions = await Promise.all(promos.map((p) => (statutDe(p) === "A_VENIR" ? null : resultats(p).then((r) => r?.totaux.evolution ?? null))));
  res.json(promos.map((p, i) => ({ ...serialiser(p), evolution: evolutions[i] })));
});

// ---------------------------------------------------------------- Résultats

const jourLocal = (iso: string, fin = false) => new Date(`${iso}T${fin ? "23:59:59.999" : "00:00:00"}`);
const isoLocal = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const decaler = (iso: string, jours: number) => {
  const d = jourLocal(iso);
  d.setDate(d.getDate() + jours);
  return isoLocal(d);
};
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Ventes des articles d'une promotion pendant sa période (jusqu'à aujourd'hui si elle court encore) et sur le
 * même nombre de jours juste avant. Les pièces comptent payées + offertes ; le gain = CA HT − achat HT ; le coût
 * de la promotion = pièces offertes au prix d'achat + remises + baisse de prix (prix promo).
 */
async function resultats(p: { id: string; societeId: string; type: string; dateDebut: Date; dateFin: Date; lignes: { articleId: string; articleOffertId: string | null }[] }, joursAvantDemandes?: number) {
  const debut = texteDate(p.dateDebut);
  const aujourdhuiIso = isoLocal(new Date());
  const finPendant = texteDate(p.dateFin) < aujourdhuiIso ? texteDate(p.dateFin) : aujourdhuiIso;
  if (debut > aujourdhuiIso) return null; // pas encore commencée
  const jours = Math.round((jourLocal(finPendant).getTime() - jourLocal(debut).getTime()) / 86_400_000) + 1;
  // Période de comparaison : la même durée juste avant, ou plus longue (30, 60, 90 jours) ; comparée en moyenne par jour.
  const joursAvant = joursAvantDemandes && joursAvantDemandes > 0 ? Math.min(365, Math.round(joursAvantDemandes)) : jours;
  const avantDebut = decaler(debut, -joursAvant);
  const avantFin = decaler(debut, -1);
  const articleIds = [...new Set(p.lignes.flatMap((l) => [l.articleId, ...(l.articleOffertId ? [l.articleOffertId] : [])]))];

  const lignes = await prisma.ligneFacture.findMany({
    where: {
      articleId: { in: articleIds },
      facture: { statut: "VALIDEE", deletedAt: null, client: { societeId: p.societeId }, date: { gte: jourLocal(avantDebut), lte: jourLocal(finPendant, true) } },
    },
    select: {
      articleId: true,
      quantite: true,
      quantiteOfferte: true,
      remise: true,
      prixUnitaire: true,
      montantHT: true,
      montantTTC: true,
      promotionId: true,
      facture: { select: { date: true } },
      article: { select: { designation: true, prixAchat: true, prixVente: true, fodec: true } },
    },
  });

  const vide = () => ({ pieces: 0, offertes: 0, ca: 0, caHT: 0, achat: 0, cout: 0 });
  const totaux = { avant: vide(), pendant: vide() };
  const parArticle = new Map<string, { designation: string; offert: boolean; avant: ReturnType<typeof vide>; pendant: ReturnType<typeof vide> }>();
  const parJour = new Map<string, number>();
  const principaux = new Set(p.lignes.map((l) => l.articleId));

  for (const l of lignes) {
    const jour = isoLocal(l.facture.date);
    const periode = jour >= debut ? "pendant" : "avant";
    const pieces = Number(l.quantite) + Number(l.quantiteOfferte);
    const achat = Number(l.article.prixAchat) * pieces;
    // Coût de cette promotion sur la ligne : pièces offertes (au prix d'achat), remise, baisse de prix.
    let cout = 0;
    if (l.promotionId === p.id) {
      cout += Number(l.quantiteOfferte) * Number(l.article.prixAchat) + Number(l.remise);
      if (p.type === "PRIX") {
        const normal = Number(l.article.prixVente) * (1 + Number(l.article.fodec) / 100);
        cout += Math.max(0, normal - Number(l.prixUnitaire)) * Number(l.quantite);
      }
    }
    const a = parArticle.get(l.articleId) ?? { designation: l.article.designation, offert: !principaux.has(l.articleId), avant: vide(), pendant: vide() };
    for (const cible of [a[periode], totaux[periode]]) {
      cible.pieces += pieces;
      cible.offertes += Number(l.quantiteOfferte);
      cible.ca += Number(l.montantTTC);
      cible.caHT += Number(l.montantHT);
      cible.achat += achat;
      cible.cout += cout;
    }
    parArticle.set(l.articleId, a);
    // Courbe : seulement les articles de la promotion (pas les articles offerts).
    if (principaux.has(l.articleId)) parJour.set(jour, (parJour.get(jour) ?? 0) + pieces);
  }

  const fini = (x: ReturnType<typeof vide>) => ({ pieces: r3(x.pieces), offertes: r3(x.offertes), ca: r3(x.ca), gain: r3(x.caHT - x.achat), cout: r3(x.cout) });
  // Évolution sur la moyenne par jour (les deux périodes peuvent avoir des durées différentes).
  const evolution = (avant: number, pendant: number) => {
    const a = avant / joursAvant;
    return a > 0 ? Math.round(((pendant / jours - a) / a) * 1000) / 10 : null;
  };
  const serie: { date: string; pieces: number; periode: "avant" | "pendant" }[] = [];
  for (let d = avantDebut; d <= finPendant; d = decaler(d, 1)) serie.push({ date: d, pieces: r3(parJour.get(d) ?? 0), periode: d >= debut ? "pendant" : "avant" });

  return {
    periode: { avant: { debut: avantDebut, fin: avantFin, jours: joursAvant }, pendant: { debut, fin: finPendant }, jours, enCours: finPendant === aujourdhuiIso && texteDate(p.dateFin) > aujourdhuiIso },
    totaux: { avant: fini(totaux.avant), pendant: fini(totaux.pendant), evolution: evolution(totaux.avant.pieces, totaux.pendant.pieces) },
    articles: [...parArticle.entries()]
      .map(([articleId, a]) => ({ articleId, designation: a.designation, offert: a.offert, avant: fini(a.avant), pendant: fini(a.pendant), evolution: evolution(a.avant.pieces, a.pendant.pieces) }))
      .sort((x, y) => y.pendant.pieces - x.pendant.pieces),
    serie,
  };
}

promotionsRouter.get("/:id/resultats", requireAdmin, async (req, res) => {
  const p = await prisma.promotion.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, include: { lignes: { select: { articleId: true, articleOffertId: true } } } });
  if (!p) return res.status(404).json({ error: "Promotion introuvable" });
  const joursAvant = Number(req.query.avant) || undefined;
  res.json(await resultats(p, joursAvant));
});

promotionsRouter.get("/:id", requireAdmin, async (req, res) => {
  const p = await prisma.promotion.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, include: INCLURE });
  if (!p) return res.status(404).json({ error: "Promotion introuvable" });
  res.json(serialiser(p));
});

const lignesData = (lignes: z.infer<typeof ligneSchema>[]) =>
  lignes.map((l, ordre) => ({
    articleId: l.articleId,
    prixPromo: l.prixPromo ?? null,
    articleOffertId: l.articleOffertId ?? null,
    quantiteOfferte: l.quantiteOfferte ?? null,
    seuil: l.seuil ?? null,
    tailleLot: l.tailleLot ?? null,
    prixLot: l.prixLot ?? null,
    ordre,
  }));

promotionsRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = promotionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Promotion invalide" });
  const d = parsed.data;
  const societeId = req.societeId!;
  const debut = enDate(d.dateDebut);
  const fin = enDate(d.dateFin);
  const articles = await prisma.article.count({ where: { id: { in: d.lignes.map((l) => l.articleId) }, societeId } });
  if (articles !== d.lignes.length) return res.status(404).json({ error: "Article introuvable" });
  const conflit = await chevauchement(societeId, debut, fin, d.lignes.map((l) => l.articleId));
  if (conflit) return res.status(409).json({ error: conflit });
  const p = await prisma.$transaction(async (tx) =>
    tx.promotion.create({
      data: {
        societeId,
        type: d.type,
        mode: d.type === "LOT" ? d.mode : null,
        numero: await prochainNumero(tx, societeId, d.type, debut.getUTCFullYear()),
        libelle: d.libelle || null,
        dateDebut: debut,
        dateFin: fin,
        lignes: { create: lignesData(d.lignes) },
      },
      include: INCLURE,
    }),
  );
  res.status(201).json(serialiser(p));
});

promotionsRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = promotionSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Promotion invalide" });
  const d = parsed.data;
  const societeId = req.societeId!;
  const existante = await prisma.promotion.findFirst({ where: { id: req.params.id, societeId, deletedAt: null } });
  if (!existante) return res.status(404).json({ error: "Promotion introuvable" });
  if (existante.type !== d.type) return res.status(400).json({ error: "Le type d'une promotion ne change pas." });
  const debut = enDate(d.dateDebut);
  const fin = enDate(d.dateFin);
  const conflit = await chevauchement(societeId, debut, fin, d.lignes.map((l) => l.articleId), existante.id);
  if (conflit) return res.status(409).json({ error: conflit });
  const p = await prisma.$transaction(async (tx) => {
    await tx.promotionLigne.deleteMany({ where: { promotionId: existante.id } });
    return tx.promotion.update({
      where: { id: existante.id },
      data: { mode: d.type === "LOT" ? d.mode : null, libelle: d.libelle || null, dateDebut: debut, dateFin: fin, lignes: { create: lignesData(d.lignes) } },
      include: INCLURE,
    });
  });
  res.json(serialiser(p));
});

// Arrêter une promotion en cours : elle finit hier (les BL déjà faits gardent leur prix).
promotionsRouter.post("/:id/arreter", requireAdmin, async (req, res) => {
  const p = await prisma.promotion.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!p) return res.status(404).json({ error: "Promotion introuvable" });
  const hier = new Date(aujourdhui().getTime() - 86_400_000);
  const maj = await prisma.promotion.update({ where: { id: p.id }, data: { dateFin: hier < p.dateDebut ? p.dateDebut : hier }, include: INCLURE });
  res.json(serialiser(maj));
});

promotionsRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.promotion.updateMany({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
