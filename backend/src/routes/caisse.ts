import { Router, type NextFunction, type Request, type Response } from "express";
import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ttcDepuisHT } from "../lib/tarifs";
import { promotionsActives } from "./promotions";
import { DROITS_CAISSIER, syncSchema, synchroniserCaisse } from "../services/caisseService";

// API de l'application de caisse (PC de caisse du supermarché). La caisse s'associe une fois à son poste
// avec le code d'appairage affiché par l'admin, puis s'authentifie avec sa clé (en-tête « Authorization:
// Caisse <clé> »). Elle télécharge sa configuration (catalogue, caissiers, touches, promotions), travaille
// hors ligne, et renvoie ses tickets dès que le serveur répond.
export const caisseRouter = Router();

const empreinte = (cle: string) => createHash("sha256").update(cle).digest("hex");

// Appairage : 10 essais ratés par adresse et par quart d'heure (code à 6 chiffres).
const essais = new Map<string, { n: number; depuis: number }>();
function tropDEssais(ip: string) {
  const e = essais.get(ip);
  if (!e || Date.now() - e.depuis > 15 * 60_000) return false;
  return e.n >= 10;
}
function noterEchec(ip: string) {
  const e = essais.get(ip);
  if (!e || Date.now() - e.depuis > 15 * 60_000) essais.set(ip, { n: 1, depuis: Date.now() });
  else e.n++;
}

caisseRouter.post("/appairer", async (req, res) => {
  const ip = req.socket.remoteAddress ?? "";
  if (tropDEssais(ip)) return res.status(429).json({ error: "Trop d'essais : réessayez dans un quart d'heure." });
  const p = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Le code d'appairage fait 6 chiffres." });
  const caisse = await prisma.caisse.findFirst({
    where: { codeAppairage: p.data.code, codeExpireLe: { gt: new Date() }, deletedAt: null, societe: { deletedAt: null, type: "SUPERMARCHE" } },
    include: { societe: { select: { nom: true } } },
  });
  if (!caisse) {
    noterEchec(ip);
    return res.status(404).json({ error: "Code inconnu ou expiré : demandez un nouveau code dans Caisse › Postes de caisse." });
  }
  const cle = randomBytes(32).toString("hex");
  await prisma.caisse.update({
    where: { id: caisse.id },
    data: { cleEmpreinte: empreinte(cle), codeAppairage: null, codeExpireLe: null, appaireeLe: new Date() },
  });
  res.json({ cle, caisse: { id: caisse.id, numero: caisse.numero, nom: caisse.nom }, societe: { id: caisse.societeId, nom: caisse.societe.nom } });
});

interface CaisseRequete {
  id: string;
  societeId: string;
  numero: number;
  nom: string;
  /** Le caissier compte le tiroir à la clôture (sinon clôture à l'aveugle). */
  comptageCaissier: boolean;
}
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      caisse?: CaisseRequete;
    }
  }
}

async function requireCaisse(req: Request, res: Response, next: NextFunction) {
  const h = req.headers.authorization;
  if (!h?.startsWith("Caisse ")) return res.status(401).json({ error: "Caisse non appairée" });
  try {
    const caisse = await prisma.caisse.findFirst({
      where: { cleEmpreinte: empreinte(h.slice("Caisse ".length).trim()), deletedAt: null, societe: { deletedAt: null } },
      select: { id: true, societeId: true, numero: true, nom: true, actif: true, comptageCaissier: true },
    });
    if (!caisse) return res.status(401).json({ error: "Cette caisse n'est plus appairée : demandez un nouveau code à l'administrateur." });
    if (!caisse.actif) return res.status(403).json({ error: "Cette caisse est désactivée par l'administrateur." });
    req.caisse = caisse;
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

// Configuration complète de la caisse (rechargée à chaque démarrage puis régulièrement).
caisseRouter.get("/config", requireCaisse, async (req, res) => {
  const { id, societeId } = req.caisse!;
  const [societe, caissiers, familles, articles, codes, stocks, promotions, dernierTicket, dernierZ, sessionOuverte] = await Promise.all([
    prisma.societe.findUnique({ where: { id: societeId }, select: { id: true, nom: true, activite: true, adresse: true, telephone: true, matriculeFiscal: true, logo: true } }),
    prisma.caissier.findMany({ where: { societeId, deletedAt: null, actif: true }, orderBy: { nom: "asc" }, select: { id: true, nom: true, codeHash: true, droits: true } }),
    prisma.familleTouche.findMany({
      where: { societeId },
      orderBy: [{ ordre: "asc" }, { nom: "asc" }],
      include: { touches: { orderBy: { ordre: "asc" }, select: { id: true, articleId: true, libelle: true, couleur: true } } },
    }),
    prisma.article.findMany({
      where: { societeId, deletedAt: null },
      orderBy: [{ ordre: "asc" }, { designation: "asc" }],
      select: { id: true, code: true, codeBarre: true, designation: true, marque: true, img: true, prixVente: true, tva: true, fodec: true, colisage: true, categorieId: true },
    }),
    prisma.codeBarreArticle.findMany({ where: { societeId }, select: { articleId: true, codeBarre: true, libelle: true } }),
    prisma.stockDepot.findMany({ where: { article: { societeId, deletedAt: null } }, select: { articleId: true, quantite: true } }),
    promotionsActives(societeId, false),
    prisma.ticketCaisse.aggregate({ where: { caisseId: id }, _max: { numero: true } }),
    prisma.sessionCaisse.aggregate({ where: { caisseId: id }, _max: { numeroZ: true } }),
    prisma.sessionCaisse.findFirst({ where: { caisseId: id, statut: "OUVERTE" }, select: { id: true, caissierId: true, ouverteLe: true, fondCaisse: true } }),
  ]);
  const codesParArticle = new Map<string, { codeBarre: string; libelle: string | null }[]>();
  for (const c of codes) codesParArticle.set(c.articleId, [...(codesParArticle.get(c.articleId) ?? []), { codeBarre: c.codeBarre, libelle: c.libelle }]);
  const stockParArticle = new Map(stocks.map((s) => [s.articleId, Number(s.quantite)]));
  res.json({
    caisse: req.caisse,
    societe,
    caissiers: caissiers.map((c) => ({ ...c, droits: Object.fromEntries(DROITS_CAISSIER.map((d) => [d, Boolean((c.droits as Record<string, boolean>)[d])])) })),
    familles,
    articles: articles.map((a) => ({
      ...a,
      prixVente: Number(a.prixVente),
      tva: Number(a.tva),
      fodec: Number(a.fodec),
      // Prix affiché en caisse (TTC, au millime).
      prixTTC: ttcDepuisHT(Number(a.prixVente), Number(a.tva), Number(a.fodec)),
      codesBarres: codesParArticle.get(a.id) ?? [],
      stock: stockParArticle.get(a.id) ?? 0,
    })),
    promotions,
    dernierNumeroTicket: dernierTicket._max.numero ?? 0,
    dernierNumeroZ: dernierZ._max.numeroZ ?? 0,
    sessionOuverte,
    genereLe: new Date().toISOString(),
  });
});

caisseRouter.post("/sync", requireCaisse, async (req, res) => {
  const p = syncSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: "Données invalides", details: p.error.flatten() });
  try {
    res.json(await synchroniserCaisse(req.caisse!, p.data));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
