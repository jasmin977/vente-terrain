import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth } from "../middleware/auth";
import { situationsClients } from "../services/creditService";

// Tableau de bord de l'admin : chiffre d'affaires, encaissements, crédits,
// vendeurs, top clients / produits, valeur du stock et marge, sur une période
// (jour / semaine / mois, ou un mois passé via ?mois=AAAA-MM) comparée à la
// période précédente de même nature.
export const tableauDeBordRouter = Router();
tableauDeBordRouter.use(requireAuth, requireAdmin);

type Periode = "jour" | "semaine" | "mois";
const arrondi = (n: number) => Math.round(n * 1000) / 1000;
const JOUR_MS = 86_400_000;

/**
 * Bornes de la période en cours (jusqu'à maintenant) et de la précédente.
 * `complete` : période révolue, comparée à la précédente entière.
 */
function bornes(periode: Periode, maintenant = new Date(), complete = false) {
  const debut = new Date(maintenant);
  debut.setHours(0, 0, 0, 0);
  if (periode === "semaine") {
    const jour = (debut.getDay() + 6) % 7; // lundi = 0
    debut.setDate(debut.getDate() - jour);
  } else if (periode === "mois") {
    debut.setDate(1);
  }
  const precedentDebut = new Date(debut);
  if (periode === "jour") precedentDebut.setDate(precedentDebut.getDate() - 1);
  else if (periode === "semaine") precedentDebut.setDate(precedentDebut.getDate() - 7);
  else precedentDebut.setMonth(precedentDebut.getMonth() - 1);
  // Comparaison « à date » : même durée écoulée dans la période précédente,
  // sinon un mois en cours au 7 serait comparé à un mois entier.
  const ecoule = maintenant.getTime() - debut.getTime();
  const precedentFin = complete
    ? new Date(debut.getTime() - 1)
    : new Date(Math.min(precedentDebut.getTime() + ecoule, debut.getTime()));
  return { debut, fin: maintenant, precedentDebut, precedentFin };
}

/**
 * Instant de référence de la période : maintenant, ou la fin d'un mois passé
 * demandé (« 2026-09 »), alors comparé au mois précédent entier.
 */
function reference(periode: Periode, mois: unknown, maintenant = new Date()) {
  if (periode !== "mois" || typeof mois !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(mois)) {
    return { instant: maintenant, complete: false };
  }
  const [annee, m] = mois.split("-").map(Number);
  const finMois = new Date(new Date(annee, m, 1).getTime() - 1); // veille du 1er du mois suivant
  return finMois < maintenant ? { instant: finMois, complete: true } : { instant: maintenant, complete: false };
}

/** Graduation du graphique : heures (jour) ou jours (semaine / mois). */
function graduations(periode: Periode, debut: Date) {
  if (periode === "jour") {
    return Array.from({ length: 24 }, (_, h) => {
      const d = new Date(debut);
      d.setHours(h);
      return { cle: String(h), debut: d, libelle: `${h}h` };
    });
  }
  const nb = periode === "semaine" ? 7 : new Date(debut.getFullYear(), debut.getMonth() + 1, 0).getDate();
  return Array.from({ length: nb }, (_, i) => {
    const d = new Date(debut);
    d.setDate(d.getDate() + i);
    return { cle: String(i), debut: d, libelle: String(d.getDate()) };
  });
}

tableauDeBordRouter.get("/", async (req, res) => {
  try {
    const periode: Periode = (["jour", "semaine", "mois"] as const).includes(req.query.periode as Periode)
      ? (req.query.periode as Periode)
      : "mois";
    const ref = reference(periode, req.query.mois);
    const { debut, fin, precedentDebut, precedentFin } = bornes(periode, ref.instant, ref.complete);
    const validees = { statut: "VALIDEE" as const, deletedAt: null };

    const [factures, precedentes, paiements, lignes, stockDepot, stockCamion, vendeurs, situations] = await Promise.all([
      prisma.facture.findMany({
        where: { ...validees, date: { gte: debut, lte: fin } },
        select: {
          id: true,
          date: true,
          montantTTC: true,
          vendeurId: true,
          clientId: true,
          typeVente: true,
          client: { select: { id: true, nomCommerce: true, code: true } },
        },
      }),
      prisma.facture.aggregate({
        where: { ...validees, date: { gte: precedentDebut, lte: precedentFin } },
        _sum: { montantTTC: true },
        _count: true,
      }),
      // Argent réellement encaissé sur la période (ventes comptant + crédits
      // recouvrés), hors règlements de factures annulées.
      prisma.paiement.findMany({
        where: {
          deletedAt: null,
          date: { gte: debut, lte: fin },
          OR: [{ factureId: null }, { facture: { statut: "VALIDEE", deletedAt: null } }],
        },
        select: { montant: true, mode: true },
      }),
      prisma.ligneFacture.findMany({
        where: { facture: { ...validees, date: { gte: debut, lte: fin } } },
        select: {
          articleId: true,
          quantite: true,
          prixUnitaire: true,
          montantHT: true,
          article: { select: { designation: true, prixAchat: true } },
        },
      }),
      prisma.stockDepot.findMany({ where: { quantite: { gt: 0 } }, include: { article: true } }),
      prisma.stockCamion.findMany({ where: { quantite: { gt: 0 } }, include: { article: true } }),
      prisma.user.findMany({ where: { role: "VENDEUR" }, select: { id: true, nom: true, code: true, actif: true } }),
      situationsClients(),
    ]);

    // ---- Chiffre d'affaires
    const ca = arrondi(factures.reduce((s, f) => s + Number(f.montantTTC), 0));
    const caPrecedent = arrondi(Number(precedentes._sum.montantTTC ?? 0));
    const evolution = caPrecedent > 0 ? Math.round(((ca - caPrecedent) / caPrecedent) * 1000) / 10 : null;

    const grad = graduations(periode, debut);
    const serie = grad.map((g) => ({ libelle: g.libelle, debut: g.debut, montant: 0 }));
    for (const f of factures) {
      const i =
        periode === "jour"
          ? new Date(f.date).getHours()
          : Math.floor((new Date(f.date).setHours(0, 0, 0, 0) - debut.getTime()) / JOUR_MS);
      if (serie[i]) serie[i].montant = arrondi(serie[i].montant + Number(f.montantTTC));
    }

    // ---- Encaissements par mode
    const encaisse: Record<string, number> = {};
    for (const p of paiements) encaisse[p.mode] = arrondi((encaisse[p.mode] ?? 0) + Number(p.montant));
    const totalEncaisse = arrondi(Object.values(encaisse).reduce((s, v) => s + v, 0));

    // ---- Vendeurs
    const parVendeur = new Map<string, { montant: number; nb: number }>();
    for (const f of factures) {
      const v = parVendeur.get(f.vendeurId) ?? { montant: 0, nb: 0 };
      v.montant += Number(f.montantTTC);
      v.nb++;
      parVendeur.set(f.vendeurId, v);
    }
    const classementVendeurs = vendeurs
      .filter((v) => v.actif || parVendeur.has(v.id))
      .map((v) => ({ ...v, montant: arrondi(parVendeur.get(v.id)?.montant ?? 0), nbFactures: parVendeur.get(v.id)?.nb ?? 0 }))
      .sort((a, b) => b.montant - a.montant);

    // ---- Top clients
    const parClient = new Map<string, { id: string; nomCommerce: string; code: string; montant: number; nb: number }>();
    for (const f of factures) {
      const c = parClient.get(f.clientId) ?? { ...f.client, montant: 0, nb: 0 };
      c.montant += Number(f.montantTTC);
      c.nb++;
      parClient.set(f.clientId, c);
    }
    const topClients = [...parClient.values()]
      .map((c) => ({ ...c, montant: arrondi(c.montant) }))
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 5);

    // ---- Top produits + marge brute (HT)
    const parArticle = new Map<string, { articleId: string; designation: string; quantite: number; montantHT: number }>();
    let marge = 0;
    let caHT = 0;
    let caHTCouvert = 0; // ventes d'articles qui ont un prix d'achat
    let lignesSansPrixAchat = 0;
    for (const l of lignes) {
      const q = Number(l.quantite);
      const a = parArticle.get(l.articleId) ?? { articleId: l.articleId, designation: l.article.designation, quantite: 0, montantHT: 0 };
      a.quantite += q;
      a.montantHT += Number(l.montantHT);
      parArticle.set(l.articleId, a);
      caHT += Number(l.montantHT);
      const achat = Number(l.article.prixAchat);
      // Sans prix d'achat, la marge serait de 100 % : on exclut ces lignes.
      if (!(achat > 0)) {
        lignesSansPrixAchat++;
        continue;
      }
      caHTCouvert += Number(l.montantHT);
      marge += Number(l.montantHT) - achat * q;
    }
    const topProduits = [...parArticle.values()]
      .map((a) => ({ ...a, montantHT: arrondi(a.montantHT) }))
      .sort((a, b) => b.quantite - a.quantite)
      .slice(0, 5);

    // ---- Crédits clients : total dû, ancienneté, plus gros débiteurs
    const maintenant = Date.now();
    const anciennete = { moins30: 0, de30a60: 0, plus60: 0 };
    const debiteurs: { clientId: string; totalDu: number; plusAncienne: Date | null }[] = [];
    for (const [clientId, s] of situations) {
      if (s.totalDu <= 0.0005) continue;
      for (const f of s.factures) {
        const jours = (maintenant - new Date(f.date).getTime()) / JOUR_MS;
        if (jours < 30) anciennete.moins30 += f.reste;
        else if (jours < 60) anciennete.de30a60 += f.reste;
        else anciennete.plus60 += f.reste;
      }
      debiteurs.push({ clientId, totalDu: s.totalDu, plusAncienne: s.factures[0]?.date ?? null });
    }
    debiteurs.sort((a, b) => b.totalDu - a.totalDu);
    const topDebiteurs = debiteurs.slice(0, 5);
    const clientsDebiteurs = await prisma.client.findMany({
      where: { id: { in: topDebiteurs.map((d) => d.clientId) } },
      select: { id: true, nomCommerce: true, code: true },
    });
    const totalDu = arrondi(debiteurs.reduce((s, d) => s + d.totalDu, 0));

    // ---- Valeur du stock (prix de vente HT)
    const valeur = (rows: { quantite: unknown; article: { prixVente: unknown } }[]) =>
      arrondi(rows.reduce((s, r) => s + Number(r.quantite) * Number(r.article.prixVente), 0));

    res.json({
      periode,
      debut,
      fin,
      precedent: { debut: precedentDebut, fin: precedentFin },
      chiffreAffaires: {
        ttc: ca,
        precedentTtc: caPrecedent,
        evolution,
        nbFactures: factures.length,
        nbFacturesPrecedent: precedentes._count,
        panierMoyen: factures.length ? arrondi(ca / factures.length) : 0,
        credit: arrondi(factures.filter((f) => f.typeVente === "CREDIT").reduce((s, f) => s + Number(f.montantTTC), 0)),
        serie,
      },
      encaissements: { total: totalEncaisse, parMode: encaisse },
      credits: {
        totalDu,
        nbClients: debiteurs.length,
        anciennete: {
          moins30: arrondi(anciennete.moins30),
          de30a60: arrondi(anciennete.de30a60),
          plus60: arrondi(anciennete.plus60),
        },
        topDebiteurs: topDebiteurs.map((d) => ({
          ...d,
          client: clientsDebiteurs.find((c) => c.id === d.clientId) ?? null,
        })),
      },
      vendeurs: classementVendeurs,
      topClients,
      topProduits,
      marge: {
        ht: arrondi(marge),
        caHT: arrondi(caHT),
        // Taux calculé sur les seules ventes d'articles qui ont un prix d'achat.
        taux: caHTCouvert > 0 ? Math.round((marge / caHTCouvert) * 1000) / 10 : null,
        // Part du CA HT couverte par le calcul (1 = toutes les ventes).
        couverture: caHT > 0 ? Math.round((caHTCouvert / caHT) * 1000) / 1000 : 1,
        complete: lignesSansPrixAchat === 0,
        lignesSansPrixAchat,
      },
      stock: { depot: valeur(stockDepot), camions: valeur(stockCamion) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
