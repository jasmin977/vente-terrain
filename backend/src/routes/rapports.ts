import { Router } from "express";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma";
import { ciblesDeLaSociete, requireAuth, requireSociete } from "../middleware/auth";

export const rapportsRouter = Router();
rapportsRouter.use(requireAuth, requireSociete, ciblesDeLaSociete);

function bornesDuJour(dateStr?: string) {
  const day = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// Module 7 - Tableau de bord quotidien
rapportsRouter.get("/dashboard", async (req, res) => {
  const { vendeurId, date } = req.query as Record<string, string | undefined>;
  const { start, end } = bornesDuJour(date);
  const vid = vendeurId ?? req.user!.id;

  const factures = await prisma.facture.findMany({
    where: { vendeurId: vid, statut: "VALIDEE", date: { gte: start, lte: end }, deletedAt: null, client: { societeId: req.societeId } },
    include: { lignes: { include: { article: true } }, paiements: true },
  });

  const caDuJour = factures.reduce((s, f) => s + Number(f.montantTTC), 0);
  const clientsVisites = new Set(factures.map((f) => f.clientId)).size;

  let montantEspeces = 0;
  let montantTPE = 0;
  let montantCredit = 0;
  for (const f of factures) {
    if (f.typeVente === "CREDIT") {
      montantCredit += Number(f.montantTTC);
      continue;
    }
    if (f.modePaiement === "ESPECES") montantEspeces += Number(f.montantTTC);
    else if (f.modePaiement === "TPE") montantTPE += Number(f.montantTTC);
  }

  const venteParHeure: Record<string, number> = {};
  const venteParMarque: Record<string, number> = {};
  const topProduits: Record<string, { designation: string; quantite: number; montant: number }> = {};

  for (const f of factures) {
    const heure = `${new Date(f.date).getHours()}h`;
    venteParHeure[heure] = (venteParHeure[heure] ?? 0) + Number(f.montantTTC);

    for (const l of f.lignes) {
      const marque = l.article.marque ?? "Autre";
      venteParMarque[marque] = (venteParMarque[marque] ?? 0) + Number(l.montantTTC);

      const key = l.articleId;
      if (!topProduits[key]) topProduits[key] = { designation: l.article.designation, quantite: 0, montant: 0 };
      topProduits[key].quantite += Number(l.quantite);
      topProduits[key].montant += Number(l.montantTTC);
    }
  }

  res.json({
    caDuJour,
    nombreFactures: factures.length,
    clientsVisites,
    montantEspeces,
    montantTPE,
    montantCredit,
    venteParHeure,
    venteParMarque,
    topProduits: Object.values(topProduits)
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 10),
  });
});

async function lignesRapportJournalier(dateStr: string | undefined, vendeurId: string | undefined, societeId: string) {
  const { start, end } = bornesDuJour(dateStr);
  const factures = await prisma.facture.findMany({
    where: {
      date: { gte: start, lte: end },
      statut: "VALIDEE",
      deletedAt: null,
      client: { societeId },
      ...(vendeurId ? { vendeurId } : {}),
    },
    include: { lignes: { include: { article: true } }, client: true, vendeur: true },
    orderBy: { date: "asc" },
  });

  const rows: Record<string, unknown>[] = [];
  for (const f of factures) {
    for (const l of f.lignes) {
      rows.push({
        date: f.date.toISOString().slice(0, 10),
        numeroFacture: f.numero,
        client: f.client.nomCommerce,
        article: l.article.designation,
        quantite: Number(l.quantite),
        prixVente: Number(l.prixUnitaire),
        montant: Number(l.montantTTC),
        modePaiement: f.typeVente === "CREDIT" ? "CREDIT" : f.modePaiement ?? "-",
        commercial: f.vendeur.nom,
      });
    }
  }

  const totaux = {
    totalVentes: factures.reduce((s, f) => s + Number(f.montantTTC), 0),
    totalEspeces: factures.filter((f) => f.modePaiement === "ESPECES").reduce((s, f) => s + Number(f.montantTTC), 0),
    totalTPE: factures.filter((f) => f.modePaiement === "TPE").reduce((s, f) => s + Number(f.montantTTC), 0),
    totalCredit: factures.filter((f) => f.typeVente === "CREDIT").reduce((s, f) => s + Number(f.montantTTC), 0),
    nombreClients: new Set(factures.map((f) => f.clientId)).size,
    nombreFactures: factures.length,
  };

  return { rows, totaux };
}

// Module 8 - Rapport Journalier (données brutes, pour affichage ou export côté mobile)
rapportsRouter.get("/journalier", async (req, res) => {
  const { date, vendeurId } = req.query as Record<string, string | undefined>;
  res.json(await lignesRapportJournalier(date, vendeurId, req.societeId!));
});

// Module 8 - Export Excel XLSX du rapport journalier (colonnes du modèle fourni)
rapportsRouter.get("/journalier.xlsx", async (req, res) => {
  const { date, vendeurId } = req.query as Record<string, string | undefined>;
  const { rows, totaux } = await lignesRapportJournalier(date, vendeurId, req.societeId!);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Rapport journalier");
  sheet.columns = [
    { header: "Date", key: "date", width: 12 },
    { header: "N° Facture", key: "numeroFacture", width: 22 },
    { header: "Client", key: "client", width: 25 },
    { header: "Article", key: "article", width: 25 },
    { header: "Qté", key: "quantite", width: 8 },
    { header: "Prix Vente", key: "prixVente", width: 12 },
    { header: "Montant", key: "montant", width: 12 },
    { header: "Mode Paiement", key: "modePaiement", width: 14 },
    { header: "Commercial", key: "commercial", width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };
  rows.forEach((r) => sheet.addRow(r));

  sheet.addRow({});
  sheet.addRow({ date: "TOTAUX" }).font = { bold: true };
  sheet.addRow({ date: "Total ventes", montant: totaux.totalVentes });
  sheet.addRow({ date: "Total espèces", montant: totaux.totalEspeces });
  sheet.addRow({ date: "Total TPE", montant: totaux.totalTPE });
  sheet.addRow({ date: "Total crédit", montant: totaux.totalCredit });
  sheet.addRow({ date: "Nombre clients", quantite: totaux.nombreClients });
  sheet.addRow({ date: "Nombre factures", quantite: totaux.nombreFactures });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="rapport-${date ?? "jour"}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});
