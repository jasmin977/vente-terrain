import { Router, type NextFunction, type Request, type Response } from "express";
import { randomInt } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { DROITS_CAISSIER, droitsSchema, totauxSessions } from "../services/caisseService";

// Supermarché › Caisse (admin) : postes de caisse (TPV) et leur appairage, caissiers et leurs droits,
// touches rapides, puis les tickets et clôtures envoyés par les caisses.
export const caisseAdminRouter = Router();
caisseAdminRouter.use(requireAuth, requireAdmin, requireSociete, seulementSupermarche);

async function seulementSupermarche(req: Request, res: Response, next: NextFunction) {
  const s = await prisma.societe.findUnique({ where: { id: req.societeId }, select: { type: true } });
  if (s?.type !== "SUPERMARCHE") return res.status(400).json({ error: "Les caisses sont réservées aux sociétés de type supermarché." });
  next();
}

const DUREE_CODE_MIN = 15;
const jour = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** Période [du 00:00, au 24:00[ en heure locale du serveur. */
function periode(q: Request["query"]) {
  const p = z.object({ du: jour.optional(), au: jour.optional() }).safeParse(q);
  const auj = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const du = (p.success && p.data.du) || iso(auj);
  const au = (p.success && p.data.au) || du;
  const fin = new Date(`${au}T00:00:00`);
  fin.setDate(fin.getDate() + 1);
  return { du: new Date(`${du}T00:00:00`), fin };
}

// ---------------------------------------------------------------- Postes de caisse (TPV)

const caisseSchema = z.object({
  nom: z.string().trim().min(1).max(60),
  numero: z.number().int().min(1).max(999).optional(),
  actif: z.boolean().optional(),
  comptageCaissier: z.boolean().optional(),
});

const selectCaisse = { id: true, numero: true, nom: true, actif: true, comptageCaissier: true, appaireeLe: true, derniereSyncLe: true, codeAppairage: true, codeExpireLe: true, createdAt: true } as const;
const sortieCaisse = (c: { codeAppairage: string | null; codeExpireLe: Date | null; [k: string]: unknown }) => {
  const codeValide = c.codeAppairage && c.codeExpireLe && c.codeExpireLe > new Date();
  return { ...c, codeAppairage: codeValide ? c.codeAppairage : null, codeExpireLe: codeValide ? c.codeExpireLe : null };
};

caisseAdminRouter.get("/caisses", async (req, res) => {
  const caisses = await prisma.caisse.findMany({ where: { societeId: req.societeId, deletedAt: null }, orderBy: { numero: "asc" }, select: selectCaisse });
  const ouvertes = await prisma.sessionCaisse.findMany({
    where: { caisseId: { in: caisses.map((c) => c.id) }, statut: "OUVERTE" },
    select: { caisseId: true, ouverteLe: true, caissier: { select: { nom: true } } },
  });
  const parCaisse = new Map(ouvertes.map((o) => [o.caisseId, o]));
  res.json(caisses.map((c) => ({ ...sortieCaisse(c), sessionOuverte: parCaisse.get(c.id) ?? null })));
});

caisseAdminRouter.post("/caisses", async (req, res) => {
  const p = caisseSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Données invalides", details: p.error.flatten() });
  const max = await prisma.caisse.aggregate({ where: { societeId: req.societeId }, _max: { numero: true } });
  const numero = p.data.numero ?? (max._max.numero ?? 0) + 1;
  const pris = await prisma.caisse.findFirst({ where: { societeId: req.societeId, numero }, select: { id: true } });
  if (pris) return res.status(409).json({ error: `La caisse n° ${numero} existe déjà.` });
  const c = await prisma.caisse.create({ data: { societeId: req.societeId!, numero, nom: p.data.nom, actif: p.data.actif ?? true }, select: selectCaisse });
  res.status(201).json(sortieCaisse(c));
});

caisseAdminRouter.put("/caisses/:id", async (req, res) => {
  const p = caisseSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Données invalides", details: p.error.flatten() });
  const c = await prisma.caisse.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caisse introuvable" });
  if (p.data.numero && p.data.numero !== c.numero) {
    const pris = await prisma.caisse.findFirst({ where: { societeId: req.societeId, numero: p.data.numero }, select: { id: true } });
    if (pris) return res.status(409).json({ error: `La caisse n° ${p.data.numero} existe déjà.` });
  }
  const maj = await prisma.caisse.update({ where: { id: c.id }, data: p.data, select: selectCaisse });
  res.json(sortieCaisse(maj));
});

// Suppression : la caisse disparaît des listes (ses tickets restent) et ne peut plus envoyer de données.
caisseAdminRouter.delete("/caisses/:id", async (req, res) => {
  const c = await prisma.caisse.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caisse introuvable" });
  const ouverte = await prisma.sessionCaisse.count({ where: { caisseId: c.id, statut: "OUVERTE" } });
  if (ouverte) return res.status(409).json({ error: "Une session est ouverte sur cette caisse : faites d'abord la clôture (Z)." });
  // Numéro libéré (contrainte d'unicité) : la caisse supprimée garde ses tickets avec un numéro hors plage.
  await prisma.caisse.update({ where: { id: c.id }, data: { deletedAt: new Date(), actif: false, cleEmpreinte: null, codeAppairage: null, numero: -Date.now() % 2_000_000_000 } });
  res.status(204).end();
});

// Code d'appairage (6 chiffres, 15 minutes) : saisi une fois dans l'application de caisse pour l'associer à ce poste.
caisseAdminRouter.post("/caisses/:id/appairage", async (req, res) => {
  const c = await prisma.caisse.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caisse introuvable" });
  let code = "";
  for (let i = 0; i < 20; i++) {
    code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const pris = await prisma.caisse.findFirst({ where: { codeAppairage: code, codeExpireLe: { gt: new Date() } }, select: { id: true } });
    if (!pris) break;
  }
  const maj = await prisma.caisse.update({
    where: { id: c.id },
    data: { codeAppairage: code, codeExpireLe: new Date(Date.now() + DUREE_CODE_MIN * 60_000) },
    select: selectCaisse,
  });
  res.json(sortieCaisse(maj));
});

// Dissocier : le PC de caisse actuel perd l'accès (vol, remplacement du poste…).
caisseAdminRouter.post("/caisses/:id/dissocier", async (req, res) => {
  const c = await prisma.caisse.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caisse introuvable" });
  const maj = await prisma.caisse.update({ where: { id: c.id }, data: { cleEmpreinte: null, appaireeLe: null, codeAppairage: null }, select: selectCaisse });
  res.json(sortieCaisse(maj));
});

// ---------------------------------------------------------------- Paramètres

caisseAdminRouter.get("/parametres", async (req, res) => {
  const s = await prisma.societe.findUnique({ where: { id: req.societeId }, select: { commissionTicketResto: true } });
  res.json({ commissionTicketResto: Number(s?.commissionTicketResto ?? 0) });
});

// Le nouveau taux vaut pour les ventes suivantes : chaque paiement garde la commission calculée à la vente.
caisseAdminRouter.put("/parametres", async (req, res) => {
  const p = z.object({ commissionTicketResto: z.number().min(0).max(50) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Taux invalide (0 à 50 %)" });
  await prisma.societe.update({ where: { id: req.societeId }, data: { commissionTicketResto: p.data.commissionTicketResto } });
  res.json(p.data);
});

// ---------------------------------------------------------------- Caissiers

const caissierSchema = z.object({
  nom: z.string().trim().min(1).max(60),
  // Code de connexion à la caisse : 4 à 6 chiffres, propre à chaque caissier.
  code: z.string().regex(/^\d{4,6}$/, "Le code doit faire 4 à 6 chiffres.").optional(),
  droits: droitsSchema.optional(),
  actif: z.boolean().optional(),
});

const DROITS_DEFAUT = Object.fromEntries(DROITS_CAISSIER.map((d) => [d, d === "annulerLigne" || d === "prelevement" || d === "cloture"]));
const selectCaissier = { id: true, nom: true, droits: true, actif: true, createdAt: true } as const;

/** Un autre caissier de la société a déjà ce code ? (les codes ne sont gardés que hachés) */
async function codeDejaPris(societeId: string, code: string, saufId?: string) {
  const autres = await prisma.caissier.findMany({ where: { societeId, deletedAt: null, ...(saufId ? { id: { not: saufId } } : {}) }, select: { codeHash: true } });
  for (const a of autres) if (await bcrypt.compare(code, a.codeHash)) return true;
  return false;
}

caisseAdminRouter.get("/caissiers", async (req, res) => {
  const liste = await prisma.caissier.findMany({ where: { societeId: req.societeId, deletedAt: null }, orderBy: { nom: "asc" }, select: selectCaissier });
  res.json(liste.map((c) => ({ ...c, droits: { ...DROITS_DEFAUT, ...(c.droits as object) } })));
});

caisseAdminRouter.post("/caissiers", async (req, res) => {
  const p = caissierSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Données invalides" });
  if (!p.data.code) return res.status(400).json({ error: "Choisissez le code du caissier (4 à 6 chiffres)." });
  if (await codeDejaPris(req.societeId!, p.data.code)) return res.status(409).json({ error: "Ce code est déjà celui d'un autre caissier." });
  const c = await prisma.caissier.create({
    data: { societeId: req.societeId!, nom: p.data.nom, codeHash: await bcrypt.hash(p.data.code, 10), droits: p.data.droits ?? DROITS_DEFAUT, actif: p.data.actif ?? true },
    select: selectCaissier,
  });
  res.status(201).json(c);
});

caisseAdminRouter.put("/caissiers/:id", async (req, res) => {
  const p = caissierSchema.partial().safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0]?.message ?? "Données invalides" });
  const c = await prisma.caissier.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caissier introuvable" });
  if (p.data.code && (await codeDejaPris(req.societeId!, p.data.code, c.id))) return res.status(409).json({ error: "Ce code est déjà celui d'un autre caissier." });
  const maj = await prisma.caissier.update({
    where: { id: c.id },
    data: {
      nom: p.data.nom,
      actif: p.data.actif,
      droits: p.data.droits,
      ...(p.data.code ? { codeHash: await bcrypt.hash(p.data.code, 10) } : {}),
    },
    select: selectCaissier,
  });
  res.json(maj);
});

caisseAdminRouter.delete("/caissiers/:id", async (req, res) => {
  const c = await prisma.caissier.findFirst({ where: { id: req.params.id, societeId: req.societeId, deletedAt: null } });
  if (!c) return res.status(404).json({ error: "Caissier introuvable" });
  await prisma.caissier.update({ where: { id: c.id }, data: { deletedAt: new Date(), actif: false } });
  res.status(204).end();
});

// ---------------------------------------------------------------- Touches rapides

// L'admin travaille sur un brouillon (familles, couleurs, ordre des touches) : « Enregistrer » le garde sur le
// serveur sans toucher aux caisses ; « Synchroniser » le publie dans caisse_familles / caisse_touches, que les
// caisses téléchargent à leur prochaine synchronisation.
const couleur = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const dispositionSchema = z.object({
  familles: z
    .array(
      z.object({
        // Identifiant d'une famille publiée (gardé à la publication) ou provisoire pour une nouvelle famille.
        id: z.string().min(1).max(60),
        nom: z.string().trim().min(1).max(40),
        couleur,
        touches: z
          .array(
            z.object({
              articleId: z.string().uuid(),
              libelle: z.string().trim().max(40).nullable(),
              couleur: couleur.nullable(),
            }),
          )
          .max(300),
      }),
    )
    .max(100),
});
type Disposition = z.infer<typeof dispositionSchema>;

const INCLURE_TOUCHES = {
  touches: { orderBy: { ordre: "asc" }, include: { article: { select: { id: true, designation: true, codeBarre: true, img: true, prixVente: true, tva: true, fodec: true } } } },
} as const;
const famillesPubliees = (societeId: string) =>
  prisma.familleTouche.findMany({ where: { societeId }, orderBy: [{ ordre: "asc" }, { nom: "asc" }], include: INCLURE_TOUCHES });

/** Version publiée (celle des caisses) et brouillon enregistré, s'il y en a un. */
caisseAdminRouter.get("/touches", async (req, res) => {
  const [publie, brouillon] = await Promise.all([famillesPubliees(req.societeId!), prisma.brouillonTouches.findUnique({ where: { societeId: req.societeId } })]);
  const b = brouillon && dispositionSchema.safeParse(brouillon.contenu);
  res.json({ publie, brouillon: b?.success ? { familles: b.data.familles, enregistreLe: brouillon!.updatedAt } : null });
});

caisseAdminRouter.put("/touches/brouillon", async (req, res) => {
  const p = dispositionSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Données invalides", details: p.error.flatten() });
  const b = await prisma.brouillonTouches.upsert({
    where: { societeId: req.societeId },
    create: { societeId: req.societeId!, contenu: p.data },
    update: { contenu: p.data },
  });
  res.json({ familles: p.data.familles, enregistreLe: b.updatedAt });
});

caisseAdminRouter.delete("/touches/brouillon", async (req, res) => {
  await prisma.brouillonTouches.deleteMany({ where: { societeId: req.societeId } });
  res.status(204).end();
});

/** Publie la disposition envoyée (familles gardées, créées ou supprimées, touches remplacées) et efface le brouillon. */
caisseAdminRouter.post("/touches/publier", async (req, res) => {
  const p = dispositionSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Données invalides", details: p.error.flatten() });
  const societeId = req.societeId!;
  const d: Disposition = p.data;
  // Articles supprimés depuis l'enregistrement du brouillon : leurs touches sont simplement écartées.
  const ids = [...new Set(d.familles.flatMap((f) => f.touches.map((t) => t.articleId)))];
  const valides = new Set((await prisma.article.findMany({ where: { id: { in: ids }, societeId, deletedAt: null }, select: { id: true } })).map((a) => a.id));
  await prisma.$transaction(async (tx) => {
    const existantes = new Set((await tx.familleTouche.findMany({ where: { societeId }, select: { id: true } })).map((f) => f.id));
    const gardees: string[] = [];
    for (const [ordre, f] of d.familles.entries()) {
      const data = { nom: f.nom, couleur: f.couleur, ordre };
      const id = existantes.has(f.id) ? (await tx.familleTouche.update({ where: { id: f.id }, data })).id : (await tx.familleTouche.create({ data: { societeId, ...data } })).id;
      gardees.push(id);
      await tx.touche.deleteMany({ where: { familleId: id } });
      await tx.touche.createMany({
        data: f.touches.filter((t) => valides.has(t.articleId)).map((t, o) => ({ familleId: id, articleId: t.articleId, libelle: t.libelle || null, couleur: t.couleur, ordre: o })),
      });
    }
    await tx.familleTouche.deleteMany({ where: { societeId, id: { notIn: gardees } } });
    await tx.brouillonTouches.deleteMany({ where: { societeId } });
  });
  res.json({ publie: await famillesPubliees(societeId) });
});

// ---------------------------------------------------------------- Tickets et clôtures

caisseAdminRouter.get("/tickets", async (req, res) => {
  const { du, fin } = periode(req.query);
  const caisseId = typeof req.query.caisseId === "string" && req.query.caisseId ? req.query.caisseId : undefined;
  const sessionId = typeof req.query.sessionId === "string" && req.query.sessionId ? req.query.sessionId : undefined;
  const tickets = await prisma.ticketCaisse.findMany({
    where: { societeId: req.societeId, ...(sessionId ? { sessionId } : { date: { gte: du, lt: fin } }), ...(caisseId ? { caisseId } : {}) },
    orderBy: { date: "desc" },
    take: 2000,
    select: {
      id: true,
      numero: true,
      date: true,
      type: true,
      montantTTC: true,
      remise: true,
      caisse: { select: { numero: true, nom: true } },
      caissier: { select: { nom: true } },
      paiements: { select: { mode: true, montant: true } },
      _count: { select: { lignes: true } },
    },
  });
  res.json(tickets);
});

caisseAdminRouter.get("/tickets/:id", async (req, res) => {
  const t = await prisma.ticketCaisse.findFirst({
    where: { id: req.params.id, societeId: req.societeId },
    include: {
      caisse: { select: { numero: true, nom: true } },
      caissier: { select: { nom: true } },
      lignes: { orderBy: { ordre: "asc" }, include: { article: { select: { designation: true, codeBarre: true } } } },
      paiements: true,
    },
  });
  if (!t) return res.status(404).json({ error: "Ticket introuvable" });
  res.json(t);
});

const r3 = (n: number) => Math.round(n * 1000) / 1000;

// Sessions (une par caissier et par ouverture de caisse) : recette par mode de règlement, retours, prélèvements,
// espèces à remettre (hors fond de caisse, qui reste dans le tiroir) et écart avec le montant remis.
caisseAdminRouter.get("/sessions", async (req, res) => {
  const { du, fin } = periode(req.query);
  const sessions = await prisma.sessionCaisse.findMany({
    where: { societeId: req.societeId, OR: [{ ouverteLe: { gte: du, lt: fin } }, { statut: "OUVERTE" }] },
    orderBy: { ouverteLe: "desc" },
    include: {
      caisse: { select: { numero: true, nom: true, comptageCaissier: true } },
      caissier: { select: { nom: true } },
      mouvements: { orderBy: { date: "asc" }, select: { id: true, type: true, montant: true, motif: true, date: true } },
      tickets: {
        where: { type: "RETOUR" },
        orderBy: { date: "asc" },
        select: {
          id: true,
          numero: true,
          date: true,
          montantTTC: true,
          lignes: { orderBy: { ordre: "asc" }, select: { quantite: true, montantTTC: true, article: { select: { designation: true } } } },
        },
      },
    },
  });
  const saisiPar = [...new Set(sessions.map((s) => s.remiseSaisiePar).filter((x): x is string => Boolean(x)))];
  const noms = new Map((await prisma.user.findMany({ where: { id: { in: saisiPar } }, select: { id: true, code: true, nom: true } })).map((u) => [u.id, u.nom || u.code]));
  const totaux = await totauxSessions(sessions.map((s) => s.id));
  res.json(
    sessions.map(({ tickets, ...s }) => {
      const t = totaux.get(s.id) ?? { nbTickets: 0, nbRetours: 0, ventes: 0, retours: 0, remises: 0, parMode: {}, commissionResto: 0, prelevements: 0, apports: 0, especesNettes: 0 };
      // Espèces que le caissier doit remettre à la fin : recette en espèces − prélèvements déjà remis + apports.
      const aRemettre = t.especesNettes;
      const remises = s.especesRemises === null ? null : Number(s.especesRemises);
      const comptees = s.especesComptees === null ? null : Number(s.especesComptees);
      // Écart : sur le montant remis (papier) s'il est saisi, sinon sur le comptage du tiroir fait à la caisse (fond compris).
      const ecart = remises !== null ? r3(remises - aRemettre) : comptees !== null ? r3(comptees - (Number(s.fondCaisse) + aRemettre)) : null;
      return {
        ...s,
        totaux: t,
        chiffreAffaires: r3(t.ventes - t.retours),
        aRemettre,
        especesAttendues: r3(Number(s.fondCaisse) + aRemettre),
        ecart,
        remiseSaisieParNom: s.remiseSaisiePar ? (noms.get(s.remiseSaisiePar) ?? null) : null,
        retours: tickets,
      };
    }),
  );
});

// Le responsable saisit la recette remise par le caissier (montant écrit sur son papier, hors fond de caisse).
caisseAdminRouter.put("/sessions/:id/remise", async (req, res) => {
  const p = z.object({ montant: z.number().min(0).max(10_000_000).nullable() }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Montant invalide" });
  const s = await prisma.sessionCaisse.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
  if (!s) return res.status(404).json({ error: "Session introuvable" });
  if (s.statut !== "CLOTUREE") return res.status(409).json({ error: "La session n'est pas encore clôturée à la caisse." });
  await prisma.sessionCaisse.update({
    where: { id: s.id },
    data:
      p.data.montant === null
        ? { especesRemises: null, remiseSaisieLe: null, remiseSaisiePar: null }
        : { especesRemises: p.data.montant, remiseSaisieLe: new Date(), remiseSaisiePar: req.user!.id },
  });
  res.status(204).end();
});

// Synthèse de la période : chiffre d'affaires par jour et par mode, meilleurs articles.
caisseAdminRouter.get("/synthese", async (req, res) => {
  const { du, fin } = periode(req.query);
  const where = { societeId: req.societeId, date: { gte: du, lt: fin } };
  const tickets = await prisma.ticketCaisse.findMany({ where, select: { sessionId: true }, distinct: ["sessionId"] });
  const totaux = await totauxSessions([...new Set(tickets.map((t) => t.sessionId))], { du, fin });
  const parMode: Record<string, number> = {};
  let commissionResto = 0;
  let ventes = 0;
  let retours = 0;
  let nbTickets = 0;
  for (const t of totaux.values()) {
    ventes += t.ventes;
    retours += t.retours;
    nbTickets += t.nbTickets;
    commissionResto += t.commissionResto;
    for (const [m, v] of Object.entries(t.parMode)) parMode[m] = (parMode[m] ?? 0) + (v ?? 0);
  }
  const top = await prisma.ligneTicket.groupBy({
    by: ["articleId"],
    where: { ticket: { ...where, type: "VENTE" } },
    _sum: { quantite: true, montantTTC: true },
    orderBy: { _sum: { montantTTC: "desc" } },
    take: 15,
  });
  const articles = await prisma.article.findMany({ where: { id: { in: top.map((t) => t.articleId) } }, select: { id: true, designation: true } });
  const nom = new Map(articles.map((a) => [a.id, a.designation]));
  res.json({
    ventes: Math.round(ventes * 1000) / 1000,
    retours: Math.round(retours * 1000) / 1000,
    nbTickets,
    panierMoyen: nbTickets ? Math.round((ventes / nbTickets) * 1000) / 1000 : 0,
    parMode,
    commissionResto: Math.round(commissionResto * 1000) / 1000,
    topArticles: top.map((t) => ({ articleId: t.articleId, designation: nom.get(t.articleId) ?? "", quantite: Number(t._sum.quantite ?? 0), montant: Number(t._sum.montantTTC ?? 0) })),
  });
});
