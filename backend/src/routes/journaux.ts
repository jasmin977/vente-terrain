import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { arrondi, payesParAchat, situation } from "../services/achatService";

/**
 * Éditions › journaux des ventes, des achats et du stock : les documents d'une période, des types choisis,
 * une ligne par document (le regroupement par jour et les totaux se font à l'écran) et la ventilation de la TVA.
 */
export const journauxRouter = Router();
journauxRouter.use(requireAuth, requireSociete, requireAdmin);

interface LigneJournal {
  id: string;
  date: Date;
  type: string;
  numero: string;
  tiers: string;
  ht: number;
  tva: number;
  timbre: number;
  ttc: number;
  paye?: number;
  reste?: number;
  /** Annulé : affiché barré, pas compté. */
  annule?: boolean;
  /** Regroupé dans une facture du même journal (BL facturé) : affiché, pas compté si les factures sont aussi choisies. */
  factureNumero?: string | null;
  /** Compté dans les totaux. */
  compte: boolean;
}

type ParTaux = Map<number, { base: number; tva: number }>;
const ajouterTaux = (m: ParTaux, lignes: { tauxTva: unknown; montantHT: unknown; montantTTC: unknown }[]) => {
  for (const l of lignes) {
    const taux = Number(l.tauxTva);
    const cur = m.get(taux) ?? { base: 0, tva: 0 };
    cur.base += Number(l.montantHT);
    cur.tva += Number(l.montantTTC) - Number(l.montantHT);
    m.set(taux, cur);
  }
};
const tauxEnListe = (m: ParTaux) =>
  [...m.entries()].sort((a, b) => b[0] - a[0]).map(([taux, v]) => ({ taux, base: arrondi(v.base), tva: arrondi(v.tva) }));

function periode(q: Record<string, unknown>) {
  const dateFrom = typeof q.dateFrom === "string" ? new Date(q.dateFrom) : null;
  const dateTo = typeof q.dateTo === "string" ? new Date(q.dateTo) : null;
  return { ...(dateFrom ? { gte: dateFrom } : {}), ...(dateTo ? { lte: dateTo } : {}) };
}
const typesDemandes = (q: Record<string, unknown>, possibles: string[]) => {
  const t = typeof q.types === "string" ? q.types.split(",").filter((x) => possibles.includes(x)) : [];
  return new Set(t.length ? t : possibles);
};

/* ---------------------------------------------------------------- Ventes : BL de vente, factures de vente */

journauxRouter.get("/ventes", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const types = typesDemandes(q, ["BL", "FACTURE"]);
  const date = periode(q);
  const societeId = req.societeId!;
  const lignes: LigneJournal[] = [];
  const parTaux: ParTaux = new Map();

  if (types.has("BL")) {
    const bls = await prisma.facture.findMany({
      where: {
        deletedAt: null,
        client: { societeId },
        date,
        ...(q.clientId ? { clientId: q.clientId } : {}),
        ...(q.vendeurId ? { vendeurId: q.vendeurId } : {}),
      },
      include: { client: { select: { nomCommerce: true } }, factureVente: { select: { numero: true } }, lignes: { select: { tauxTva: true, montantHT: true, montantTTC: true } } },
      orderBy: { date: "asc" },
    });
    for (const b of bls) {
      const annule = b.statut === "ANNULEE";
      // Un BL facturé compte dans sa facture quand les factures sont aussi dans le journal.
      const compte = !annule && !(b.factureVenteId && types.has("FACTURE"));
      if (compte) ajouterTaux(parTaux, b.lignes);
      lignes.push({
        id: b.id,
        date: b.date,
        type: "BL",
        numero: b.numero,
        tiers: b.client.nomCommerce,
        ht: Number(b.montantHT),
        tva: Number(b.montantTVA),
        timbre: 0,
        ttc: Number(b.montantTTC),
        annule,
        factureNumero: b.factureVente?.numero ?? null,
        compte,
      });
    }
  }

  if (types.has("FACTURE")) {
    const factures = await prisma.factureVente.findMany({
      where: { societeId, date, ...(q.clientId ? { clientId: q.clientId } : {}) },
      include: { client: { select: { nomCommerce: true } }, lignes: { select: { tauxTva: true, montantHT: true, montantTTC: true } } },
      orderBy: { date: "asc" },
    });
    for (const f of factures) {
      ajouterTaux(parTaux, f.lignes);
      lignes.push({
        id: f.id,
        date: f.date,
        type: "FACTURE",
        numero: f.numero,
        tiers: f.client?.nomCommerce ?? "Plusieurs clients",
        ht: Number(f.montantHT),
        tva: Number(f.montantTVA),
        timbre: Number(f.timbre),
        ttc: Number(f.montantTTC) + Number(f.timbre),
        compte: true,
      });
    }
  }

  lignes.sort((a, b) => a.date.getTime() - b.date.getTime());
  res.json({ lignes, parTaux: tauxEnListe(parTaux) });
});

/* ---------------------------------------------------------------- Achats : BL, factures, B° Entrée */

journauxRouter.get("/achats", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const types = typesDemandes(q, ["BL", "FACTURE", "ENTREE"]);
  const achats = await prisma.achat.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      date: periode(q),
      type: { in: [...types] as ("BL" | "FACTURE" | "ENTREE")[] },
      ...(q.fournisseurId ? { fournisseurId: q.fournisseurId } : {}),
    },
    include: {
      fournisseur: { select: { nom: true, divers: true } },
      facture: { select: { numero: true } },
      lignes: { select: { tauxTva: true, montantHT: true, montantTTC: true } },
    },
    orderBy: { date: "asc" },
  });
  const payes = await payesParAchat(achats.map((a) => a.id));
  const parTaux: ParTaux = new Map();
  const lignes: LigneJournal[] = [];
  for (const a of achats) {
    const s = situation(a, payes);
    if (q.statut === "impaye" && !(s.reste > 0)) continue;
    if (q.statut === "paye" && s.statut !== "PAYE") continue;
    const compte = !(a.factureId && types.has("FACTURE"));
    if (compte) ajouterTaux(parTaux, a.lignes);
    lignes.push({
      id: a.id,
      date: a.date,
      type: a.type,
      numero: a.numero,
      tiers: a.type === "ENTREE" ? a.notes || "—" : a.fournisseur.divers ? a.fournisseurLibre || "Divers" : a.fournisseur.nom,
      ht: Number(a.montantHT),
      tva: Number(a.montantTVA),
      timbre: Number(a.timbre),
      ttc: arrondi(Number(a.montantTTC) + Number(a.timbre)),
      paye: s.statut === "FACTURE" ? undefined : s.paye,
      reste: s.statut === "FACTURE" ? undefined : s.reste,
      factureNumero: a.facture?.numero ?? null,
      compte,
    });
  }
  res.json({ lignes, parTaux: tauxEnListe(parTaux) });
});

/* ---------------------------------------------------------------- Stock : B° Sortie (chargements), B° Retour */

journauxRouter.get("/stock", async (req, res) => {
  const q = req.query as Record<string, string | undefined>;
  const types = typesDemandes(q, ["SORTIE", "RETOUR"]);
  const sens: ("CHARGEMENT" | "RETOUR")[] = [];
  if (types.has("SORTIE")) sens.push("CHARGEMENT");
  if (types.has("RETOUR")) sens.push("RETOUR");
  const bons = await prisma.chargementCamion.findMany({
    where: {
      deletedAt: null,
      vendeur: { societeId: req.societeId },
      date: periode(q),
      sens: { in: sens },
      ...(q.vendeurId ? { vendeurId: q.vendeurId } : {}),
    },
    include: {
      vendeur: { select: { nom: true } },
      lignes: { include: { article: { select: { colisage: true, prixAchat: true, prixVente: true } } } },
    } satisfies Prisma.ChargementCamionInclude,
    orderBy: { date: "asc" },
  });
  const lignes = bons.map((b) => {
    let pieces = 0;
    let valeurAchat = 0;
    let valeurVente = 0;
    for (const l of b.lignes) {
      // Les anciennes lignes n'ont que des colis : reconverties en pièces.
      const p = l.quantiteUnites !== null ? Number(l.quantiteUnites) : Number(l.quantiteColis) * l.article.colisage;
      pieces += p;
      valeurAchat += p * Number(l.article.prixAchat);
      valeurVente += p * Number(l.article.prixVente);
    }
    return {
      id: b.id,
      date: b.date,
      type: b.sens === "RETOUR" ? "RETOUR" : "SORTIE",
      numero: b.reference ?? "—",
      tiers: b.vendeur.nom,
      nbArticles: b.lignes.length,
      pieces: arrondi(pieces),
      valeurAchat: arrondi(valeurAchat),
      valeurVente: arrondi(valeurVente),
      compte: true,
    };
  });
  res.json({ lignes });
});
