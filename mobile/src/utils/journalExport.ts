import { Capacitor } from "@capacitor/core";
import { societeImprimee } from "./societe";

/** Contenu d'un journal prêt à imprimer ou à exporter : lignes regroupées par jour, sous-totaux, totaux. */
export interface JournalExport {
  titre: string;
  /** « Du 01/09/2026 au 30/09/2026 · BL de vente, Factures de vente ». */
  sousTitre: string;
  colonnes: { titre: string; droite?: boolean }[];
  jours: { libelle: string; lignes: string[][]; sousTotal: string[] }[];
  total: string[];
  /** Totaux par type de document : [libellé, nombre, montant]. */
  parType: string[][];
  /** Ventilation de la TVA : [base, taux, montant]. */
  parTaux?: string[][];
}

/** Journal en PDF (A4 paysage) : en-tête de la société, jours avec leur sous-total, total, totaux par type, TVA. */
export async function journalEnPdf(j: JournalExport) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const marge = 10;
  const largeur = doc.internal.pageSize.getWidth();
  const societe = societeImprimee();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(societe.nom, marge, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (societe.matriculeFiscal) doc.text(`MF : ${societe.matriculeFiscal}`, marge, 16.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(j.titre, largeur / 2, 13, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(j.sousTitre, largeur / 2, 19, { align: "center" });

  const nb = j.colonnes.length;
  type Cellule = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  const corps: Cellule[][] = [];
  for (const jour of j.jours) {
    corps.push([{ content: jour.libelle, colSpan: nb, styles: { fontStyle: "bold", fillColor: [236, 241, 247] } }]);
    for (const l of jour.lignes) corps.push(l);
    corps.push(jour.sousTotal.map((c) => ({ content: c, styles: { fontStyle: "bold", fillColor: [248, 248, 248] } })));
  }
  corps.push(j.total.map((c) => ({ content: c, styles: { fontStyle: "bold", fillColor: [204, 228, 247] } })));

  const alignes: Record<number, { halign: "right" }> = {};
  j.colonnes.forEach((c, i) => {
    if (c.droite) alignes[i] = { halign: "right" };
  });
  autoTable(doc, {
    startY: 24,
    margin: { left: marge, right: marge },
    head: [j.colonnes.map((c) => c.titre)],
    body: corps as never,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4, lineColor: 200, lineWidth: 0.15, textColor: 20 },
    headStyles: { fillColor: [31, 58, 95], textColor: 255, fontStyle: "bold" },
    columnStyles: alignes,
    didParseCell: (c) => {
      if (c.section === "head" && j.colonnes[c.column.index]?.droite) c.cell.styles.halign = "right";
    },
  });

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  autoTable(doc, {
    startY: y,
    margin: { left: marge, right: largeur / 2 + 5 },
    head: [["Type de document", "Nombre", "Montant"]],
    body: j.parType,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4 },
    headStyles: { fillColor: [31, 58, 95], textColor: 255 },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
  });
  if (j.parTaux && j.parTaux.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: largeur / 2 + 5, right: marge },
      head: [["Base HT", "Taux TVA", "Montant TVA"]],
      body: j.parTaux,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8, cellPadding: 1.4 },
      headStyles: { fillColor: [31, 58, 95], textColor: 255 },
      columnStyles: { 0: { halign: "right" }, 1: { halign: "right" }, 2: { halign: "right" } },
    });
  }
  y = doc.internal.pageSize.getHeight() - 6;
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.text(`${j.titre} · ${j.sousTitre}`, marge, y);
    doc.text(`Page ${p}/${pages}`, largeur - marge, y, { align: "right" });
  }
  return doc;
}

function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const nomFichier = (j: JournalExport, ext: string) => `${j.titre.toLowerCase().replace(/[^a-z0-9]+/gi, "-")}-${new Date().toISOString().slice(0, 10)}.${ext}`;

export async function telechargerJournalPdf(j: JournalExport) {
  const doc = await journalEnPdf(j);
  if (Capacitor.isNativePlatform()) {
    doc.save(nomFichier(j, "pdf"));
    return;
  }
  telecharger(doc.output("blob"), nomFichier(j, "pdf"));
}

export async function imprimerJournal(j: JournalExport) {
  const doc = await journalEnPdf(j);
  const url = URL.createObjectURL(doc.output("blob"));
  const cadre = document.createElement("iframe");
  cadre.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  cadre.src = url;
  cadre.onload = () => {
    cadre.contentWindow?.print();
    setTimeout(() => {
      cadre.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  document.body.appendChild(cadre);
}

/** Excel (CSV ; séparateur « ; », virgule décimale) : une ligne par document, sous-totaux par jour et total. */
export function telechargerJournalCsv(j: JournalExport) {
  const echapper = (v: string) => (/[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lignes: string[] = [j.titre, j.sousTitre, "", ["Jour", ...j.colonnes.map((c) => c.titre)].map(echapper).join(";")];
  for (const jour of j.jours) {
    for (const l of jour.lignes) lignes.push([jour.libelle, ...l].map(echapper).join(";"));
    lignes.push([jour.libelle, ...jour.sousTotal].map(echapper).join(";"));
  }
  lignes.push(["", ...j.total].map(echapper).join(";"));
  lignes.push("", "Type de document;Nombre;Montant", ...j.parType.map((r) => r.map(echapper).join(";")));
  if (j.parTaux?.length) lignes.push("", "Base HT;Taux TVA;Montant TVA", ...j.parTaux.map((r) => r.map(echapper).join(";")));
  // BOM : Excel lit alors les accents correctement.
  telecharger(new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" }), nomFichier(j, "csv"));
}
