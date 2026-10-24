import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";
import { situationsSociete } from "../services/creditService";
import { netAPayer, payesParAchat, situation, soldesFournisseurs } from "../services/achatService";

// Tableau de bord de l'admin : chiffre d'affaires, encaissements, crédits,
// vendeurs, top clients / produits, valeur du stock et marge, sur une période
// (jour / semaine / mois, ou un mois passé via ?mois=AAAA-MM) comparée à la
// période précédente de même nature.
export const tableauDeBordRouter = Router();
tableauDeBordRouter.use(requireAuth, requireAdmin, requireSociete);

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

/**
 * Période libre (?debut=…&fin=…, choisie au PC) : comparée à la même durée juste avant.
 * Graphique par heure (un jour), par jour (jusqu'à 3 mois) ou par mois (au-delà).
 */
function bornesPlage(debutTexte: string, finTexte: string) {
  const debut = new Date(debutTexte);
  const fin = new Date(finTexte);
  const duree = Math.max(0, fin.getTime() - debut.getTime());
  const precedentFin = new Date(debut.getTime() - 1);
  const precedentDebut = new Date(precedentFin.getTime() - duree);
  const nbJours = Math.round((new Date(fin).setHours(0, 0, 0, 0) - new Date(debut).setHours(0, 0, 0, 0)) / JOUR_MS) + 1;
  const pas: "heure" | "jour" | "mois" = nbJours <= 1 ? "heure" : nbJours <= 92 ? "jour" : "mois";
  return { debut, fin, precedentDebut, precedentFin, pas, nbJours };
}

function graduationsPlage(pas: "heure" | "jour" | "mois", debut: Date, fin: Date) {
  if (pas === "heure") return graduations("jour", debut);
  if (pas === "jour") {
    const res = [];
    for (const d = new Date(new Date(debut).setHours(0, 0, 0, 0)); d <= fin; d.setDate(d.getDate() + 1)) {
      res.push({ cle: String(res.length), debut: new Date(d), libelle: String(d.getDate()) });
    }
    return res;
  }
  const res = [];
  for (const d = new Date(debut.getFullYear(), debut.getMonth(), 1); d <= fin; d.setMonth(d.getMonth() + 1)) {
    res.push({ cle: String(res.length), debut: new Date(d), libelle: String(d.getMonth() + 1) });
  }
  return res;
}

tableauDeBordRouter.get("/", async (req, res) => {
  try {
    const periode: Periode = (["jour", "semaine", "mois"] as const).includes(req.query.periode as Periode)
      ? (req.query.periode as Periode)
      : "mois";
    const ref = reference(periode, req.query.mois);
    const plage = typeof req.query.debut === "string" && typeof req.query.fin === "string" ? bornesPlage(req.query.debut, req.query.fin) : null;
    const { debut, fin, precedentDebut, precedentFin } = plage ?? bornes(periode, ref.instant, ref.complete);
    // Pas du graphique : heure, jour ou mois.
    const pas: "heure" | "jour" | "mois" = plage ? plage.pas : periode === "jour" ? "heure" : "jour";
    // Bons de livraison validés des clients de la société.
    const societeId = req.societeId!;
    const validees = { statut: "VALIDEE" as const, deletedAt: null, client: { societeId } };

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
          client: { societeId },
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
      prisma.stockDepot.findMany({ where: { quantite: { gt: 0 }, article: { societeId } }, include: { article: true } }),
      prisma.stockCamion.findMany({ where: { quantite: { gt: 0 }, vendeur: { societeId } }, include: { article: true } }),
      prisma.user.findMany({ where: { role: "VENDEUR", societeId }, select: { id: true, nom: true, code: true, actif: true } }),
      situationsSociete(societeId),
    ]);

    // ---- Chiffre d'affaires
    const ca = arrondi(factures.reduce((s, f) => s + Number(f.montantTTC), 0));
    const caPrecedent = arrondi(Number(precedentes._sum.montantTTC ?? 0));
    const evolution = caPrecedent > 0 ? Math.round(((ca - caPrecedent) / caPrecedent) * 1000) / 10 : null;

    const grad = plage ? graduationsPlage(plage.pas, debut, fin) : graduations(periode, debut);
    const serie = grad.map((g) => ({ libelle: g.libelle, debut: g.debut, montant: 0 }));
    for (const f of factures) {
      const df = new Date(f.date);
      const i =
        pas === "heure"
          ? df.getHours()
          : pas === "mois"
            ? (df.getFullYear() - debut.getFullYear()) * 12 + df.getMonth() - debut.getMonth()
            : Math.floor((new Date(df).setHours(0, 0, 0, 0) - new Date(debut).setHours(0, 0, 0, 0)) / JOUR_MS);
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
      where: { id: { in: topDebiteurs.map((d) => d.clientId) }, societeId },
      select: { id: true, nomCommerce: true, code: true },
    });
    const totalDu = arrondi(debiteurs.reduce((s, d) => s + d.totalDu, 0));

    // ---- Factures de vente, achats, fournisseurs, dépenses (sur la même période)
    const periodeDates = { gte: debut, lte: fin };
    const precedenteDates = { gte: precedentDebut, lte: precedentFin };
    // Trésorerie : une traite fournisseur sort de la banque à son échéance, pas le jour où elle est remise.
    const aujourdhui = new Date();
    const finEchue = fin < aujourdhui ? fin : aujourdhui;
    const [facturesVente, blAFacturer, achats, achatsPrecedents, reglementsF, depenses, depensesPrecedentes, soldes, fournisseurs, traitesEchues, traitesAVenir] = await Promise.all([
      prisma.factureVente.findMany({ where: { societeId, date: periodeDates }, select: { montantTTC: true, timbre: true } }),
      // BL de vente validés pas encore transformés en facture (jusqu'à la fin de la période).
      prisma.facture.aggregate({ where: { ...validees, factureVenteId: null, date: { lte: fin } }, _sum: { montantTTC: true }, _count: true }),
      // Achats : factures fournisseurs + BL pas encore regroupés dans une facture (un BL facturé compte dans sa facture).
      prisma.achat.findMany({ where: { societeId, deletedAt: null, factureId: null, date: periodeDates }, select: { type: true, montantTTC: true, timbre: true } }),
      prisma.achat.findMany({ where: { societeId, deletedAt: null, factureId: null, date: precedenteDates }, select: { montantTTC: true, timbre: true } }),
      prisma.reglementFournisseur.findMany({ where: { societeId, deletedAt: null, date: periodeDates }, select: { montant: true, mode: true } }),
      prisma.depense.findMany({ where: { societeId, deletedAt: null, date: periodeDates }, select: { montant: true, categorie: { select: { id: true, nom: true } } } }),
      prisma.depense.aggregate({ where: { societeId, deletedAt: null, date: precedenteDates }, _sum: { montant: true } }),
      soldesFournisseurs(societeId),
      prisma.fournisseur.findMany({ where: { societeId, deletedAt: null }, select: { id: true, nom: true, ref: true, divers: true } }),
      // Traites arrivées à échéance dans la période (et déjà passées) : l'argent est sorti.
      prisma.reglementFournisseur.aggregate({
        where: { societeId, deletedAt: null, mode: "TRAITE", echeance: { gte: debut, lte: finEchue } },
        _sum: { montant: true },
      }),
      // Traites remises, pas encore échues : sortiront plus tard.
      prisma.reglementFournisseur.aggregate({
        where: { societeId, deletedAt: null, mode: "TRAITE", echeance: { gt: aujourdhui } },
        _sum: { montant: true },
        _count: true,
      }),
    ]);
    const evol = (actuel: number, avant: number) => (avant > 0 ? Math.round(((actuel - avant) / avant) * 1000) / 10 : null);

    const totalAchats = arrondi(achats.reduce((s, a) => s + netAPayer(a), 0));
    const totalAchatsPrecedent = arrondi(achatsPrecedents.reduce((s, a) => s + netAPayer(a), 0));
    const blAchats = achats.filter((a) => a.type === "BL");
    const facturesAchats = achats.filter((a) => a.type === "FACTURE");
    const entreesAchats = achats.filter((a) => a.type === "ENTREE");

    const regleParMode: Record<string, number> = {};
    for (const r of reglementsF) regleParMode[r.mode] = arrondi((regleParMode[r.mode] ?? 0) + Number(r.montant));
    const totalRegle = arrondi(reglementsF.reduce((s, r) => s + Number(r.montant), 0));

    const parCategorie = new Map<string, { id: string; nom: string; montant: number; nb: number }>();
    for (const d of depenses) {
      const c = parCategorie.get(d.categorie.id) ?? { ...d.categorie, montant: 0, nb: 0 };
      c.montant += Number(d.montant);
      c.nb++;
      parCategorie.set(d.categorie.id, c);
    }
    const totalDepenses = arrondi(depenses.reduce((s, d) => s + Number(d.montant), 0));
    const totalDepensesPrecedent = arrondi(Number(depensesPrecedentes._sum.montant ?? 0));

    const aPayer = fournisseurs
      .map((f) => ({ ...f, solde: soldes.get(f.id)?.solde ?? 0, nbImpayes: soldes.get(f.id)?.nbImpayes ?? 0 }))
      .filter((f) => f.solde > 0.0005)
      .sort((a, b) => b.solde - a.solde);

    // ---- Valeur du stock (prix de vente HT)
    const valeur = (rows: { quantite: unknown; article: { prixVente: unknown } }[]) =>
      arrondi(rows.reduce((s, r) => s + Number(r.quantite) * Number(r.article.prixVente), 0));

    res.json({
      // « plage » : période libre choisie au PC ; pas = graduation du graphique.
      periode: plage ? (plage.nbJours <= 1 ? "jour" : "plage") : periode,
      pas,
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
      facturesVente: {
        nb: facturesVente.length,
        total: arrondi(facturesVente.reduce((s, f) => s + Number(f.montantTTC) + Number(f.timbre ?? 0), 0)),
        blAFacturer: { nb: blAFacturer._count, total: arrondi(Number(blAFacturer._sum.montantTTC ?? 0)) },
      },
      achats: {
        total: totalAchats,
        precedent: totalAchatsPrecedent,
        evolution: evol(totalAchats, totalAchatsPrecedent),
        nbBL: blAchats.length,
        totalBL: arrondi(blAchats.reduce((s, a) => s + netAPayer(a), 0)),
        nbFactures: facturesAchats.length,
        totalFactures: arrondi(facturesAchats.reduce((s, a) => s + netAPayer(a), 0)),
        nbEntrees: entreesAchats.length,
        totalEntrees: arrondi(entreesAchats.reduce((s, a) => s + netAPayer(a), 0)),
      },
      fournisseurs: {
        du: arrondi(aPayer.reduce((s, f) => s + f.solde, 0)),
        nbAPayer: aPayer.length,
        regle: totalRegle,
        regleParMode,
        topAPayer: aPayer.slice(0, 5).map((f) => ({ id: f.id, nom: f.nom, ref: f.ref, divers: f.divers, solde: arrondi(f.solde), nbImpayes: f.nbImpayes })),
      },
      depenses: {
        total: totalDepenses,
        nb: depenses.length,
        precedent: totalDepensesPrecedent,
        evolution: evol(totalDepenses, totalDepensesPrecedent),
        parCategorie: [...parCategorie.values()].map((c) => ({ ...c, montant: arrondi(c.montant) })).sort((a, b) => b.montant - a.montant),
      },
      // Argent entré (encaissements clients) moins argent sorti (fournisseurs payés + dépenses) sur la période. Les
      // traites comptent à leur échéance ; celles pas encore échues sont à part (« traites à venir »).
      tresorerie: (() => {
        const horsTraites = arrondi(reglementsF.filter((r) => r.mode !== "TRAITE").reduce((s, r) => s + Number(r.montant), 0));
        const traites = arrondi(Number(traitesEchues._sum.montant ?? 0));
        const sorties = arrondi(horsTraites + traites + totalDepenses);
        return {
          entrees: totalEncaisse,
          sorties,
          solde: arrondi(totalEncaisse - sorties),
          traitesEchues: traites,
          traitesAVenir: { nb: traitesAVenir._count, total: arrondi(Number(traitesAVenir._sum.montant ?? 0)) },
        };
      })(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ---------------------------------------------------------------- Activité d'un jour

const JOURS_ECHEANCE = 10;
const JOURS_EXPIRATION = 14;

/**
 * Ce qui a été saisi un jour donné (achats, articles, prix, règlements fournisseurs, documents restés impayés),
 * et ce qui approche : traites qui arrivent à échéance, articles du dépôt qui expirent dans deux semaines.
 * ?debut=…&fin=… : bornes du jour, dans le fuseau du PC de l'admin.
 */
tableauDeBordRouter.get("/activite", async (req, res) => {
  try {
    const societeId = req.societeId!;
    const debut = typeof req.query.debut === "string" ? new Date(req.query.debut) : new Date(new Date().setHours(0, 0, 0, 0));
    const fin = typeof req.query.fin === "string" ? new Date(req.query.fin) : new Date(new Date().setHours(23, 59, 59, 999));
    const jour = { gte: debut, lte: fin };
    const maintenant = new Date();
    const limiteEcheance = new Date(maintenant.getTime() + JOURS_ECHEANCE * JOUR_MS);
    const limiteExpiration = new Date(maintenant.getTime() + JOURS_EXPIRATION * JOUR_MS);

    const [achats, articles, prix, reglements, traites, lots, depenses] = await Promise.all([
      prisma.achat.findMany({
        where: { societeId, deletedAt: null, createdAt: jour },
        include: { fournisseur: { select: { nom: true, divers: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.article.findMany({
        where: { societeId, deletedAt: null, createdAt: jour },
        select: { id: true, designation: true, code: true, codeBarre: true, prixAchat: true, prixVente: true },
        orderBy: { createdAt: "asc" },
      }),
      prisma.historiquePrix.findMany({
        where: { date: jour, source: { not: "CREATION" }, article: { societeId } },
        include: { article: { select: { designation: true } } },
        orderBy: { date: "asc" },
      }),
      prisma.reglementFournisseur.findMany({
        where: { societeId, deletedAt: null, date: jour },
        include: { fournisseur: { select: { nom: true, divers: true } }, achat: { select: { type: true, numero: true } } },
        orderBy: { createdAt: "asc" },
      }),
      prisma.reglementFournisseur.findMany({
        where: { societeId, deletedAt: null, mode: "TRAITE", echeance: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lte: limiteEcheance } },
        include: { fournisseur: { select: { nom: true, divers: true } }, achat: { select: { type: true, numero: true } } },
        orderBy: { echeance: "asc" },
      }),
      prisma.lotDepot.findMany({
        where: { quantite: { gt: 0 }, dateExpiration: { not: null, lte: limiteExpiration }, article: { societeId, deletedAt: null } },
        include: { article: { select: { id: true, designation: true, codeBarre: true } } },
        orderBy: { dateExpiration: "asc" },
      }),
      prisma.depense.findMany({
        where: { societeId, deletedAt: null, date: jour },
        include: { categorie: { select: { nom: true } }, fournisseur: { select: { nom: true, divers: true } }, vendeur: { select: { nom: true } } },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    const payes = await payesParAchat(achats.map((a) => a.id));
    const nomTiers = (f: { nom: string; divers: boolean }, libre?: string | null) => (f.divers ? libre || "Divers" : f.nom);
    const docs = achats.map((a) => {
      const s = situation(a, payes);
      return {
        id: a.id,
        type: a.type,
        numero: a.numero,
        tiers: a.type === "ENTREE" ? a.notes || "—" : nomTiers(a.fournisseur, a.fournisseurLibre),
        net: arrondi(Number(a.montantTTC) + Number(a.timbre)),
        paye: s.paye,
        reste: s.reste,
        statut: s.statut,
      };
    });

    // Changement de prix : comparé au prix précédent de l'article (la ligne d'historique juste avant).
    const changements = [];
    for (const p of prix) {
      const avant = await prisma.historiquePrix.findFirst({ where: { articleId: p.articleId, date: { lt: p.date } }, orderBy: { date: "desc" } });
      if (!avant) continue;
      const a0 = Number(avant.prixAchat), a1 = Number(p.prixAchat), v0 = Number(avant.prixVente), v1 = Number(p.prixVente);
      if (Math.abs(a0 - a1) < 0.0005 && Math.abs(v0 - v1) < 0.0005) continue;
      changements.push({ id: p.id, articleId: p.articleId, designation: p.article.designation, ancienAchat: a0, nouveauAchat: a1, ancienVente: v0, nouveauVente: v1, date: p.date });
    }

    res.json({
      debut,
      fin,
      achats: docs,
      impayes: docs.filter((d) => d.reste > 0),
      articles: articles.map((a) => ({ ...a, prixAchat: Number(a.prixAchat), prixVente: Number(a.prixVente) })),
      prix: changements,
      reglements: reglements.map((r) => ({
        id: r.id,
        fournisseur: nomTiers(r.fournisseur),
        document: r.achat ? `${r.achat.type === "BL" ? "BL" : r.achat.type === "ENTREE" ? "B° Entrée" : "Facture"} n° ${r.achat.numero}` : "Avance sur compte",
        mode: r.mode,
        reference: r.reference,
        montant: Number(r.montant),
      })),
      traites: traites.map((r) => ({
        id: r.id,
        fournisseur: nomTiers(r.fournisseur),
        document: r.achat ? `${r.achat.type === "BL" ? "BL" : r.achat.type === "ENTREE" ? "B° Entrée" : "Facture"} n° ${r.achat.numero}` : null,
        reference: r.reference,
        montant: Number(r.montant),
        echeance: r.echeance,
        jours: Math.ceil((new Date(r.echeance!).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / JOUR_MS),
      })),
      depenses: depenses.map((d) => ({
        id: d.id,
        description: d.description,
        categorie: d.categorie.nom,
        beneficiaire: d.fournisseur ? nomTiers(d.fournisseur) : d.beneficiaire,
        camion: d.vendeur?.nom ?? null,
        mode: d.mode,
        reference: d.reference,
        montant: Number(d.montant),
      })),
      expirations: lots.map((l) => ({
        id: l.id,
        articleId: l.article.id,
        designation: l.article.designation,
        codeBarre: l.article.codeBarre,
        quantite: Number(l.quantite),
        dateExpiration: l.dateExpiration,
        jours: Math.ceil((new Date(l.dateExpiration!).getTime() - new Date(new Date().setHours(0, 0, 0, 0)).getTime()) / JOUR_MS),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
