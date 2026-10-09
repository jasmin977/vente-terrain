import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import type { Article } from "../types/article";
import type { Facture } from "../types/facture";
import { societeImprimee } from "./societe";
import PdfPrinter from "../plugins/pdfPrinter";

export type TypeBon = "ENTREE" | "SORTIE" | "RETOUR";

export interface BonA4 {
  type: TypeBon;
  /** Référence saisie, sinon la date du bon (AAAAMMJJ). */
  numero: string;
  date: string;
  vendeur?: { nom: string; voiture?: string | null; matriculeVoiture?: string | null };
  lignes: { article: Article; pieces: number }[];
}

const TITRES: Record<TypeBon, string> = { ENTREE: "BON D'ENTRÉE", SORTIE: "SORTIE", RETOUR: "RETOUR" };
const BLEU: [number, number, number] = [149, 179, 215]; // en-têtes Désignation / PRIX du modèle papier

/** Numéro imprimé : la référence du bon, sinon sa date (20251005). */
export function numeroBon(reference: string | null | undefined, date: string): string {
  if (reference?.trim()) return reference.trim();
  const d = new Date(date);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

// Prix au format du modèle : 5,000 (virgule, 3 décimales).
const prix = (n: number) => Number(n).toFixed(3).replace(".", ",");

const designation = (a: Article) => [a.marque, a.designation, a.unit].filter(Boolean).join(" ");

/** Page A4 avec l'en-tête de la société (nom, activité, MF). */
async function nouveauDocumentA4() {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const marge = 14;
  const largeur = doc.internal.pageSize.getWidth();
  const SOCIETE = societeImprimee();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(SOCIETE.nom, marge, 18);
  doc.setFontSize(11);
  doc.text(SOCIETE.activite, marge, 24.5);
  doc.setFontSize(9);
  doc.text(`MF: ${SOCIETE.matriculeFiscal}`, marge, 30);
  // Adresse et téléphone à droite, sous l'en-tête.
  doc.setFont("helvetica", "normal");
  const coordonnees = [SOCIETE.adresse, SOCIETE.telephone && `Tél. : ${SOCIETE.telephone}`].filter(Boolean) as string[];
  coordonnees.forEach((ligne, i) => doc.text(ligne, largeur - marge, 18 + i * 5, { align: "right" }));
  doc.setFont("helvetica", "bold");
  return { doc, autoTable, marge, largeur };
}

/** Deux cadres de signature sous le dernier tableau (nouvelle page si besoin). */
function signatures(doc: Awaited<ReturnType<typeof nouveauDocumentA4>>["doc"], marge: number, gauche: string, droite: string, ecart = 14) {
  const largeur = doc.internal.pageSize.getWidth();
  const fin = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + ecart;
  const y = fin + 28 > doc.internal.pageSize.getHeight() - 10 ? (doc.addPage(), 24) : fin;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(gauche, marge, y);
  doc.text(droite, largeur / 2 + 6, y);
  doc.setLineWidth(0.25);
  doc.rect(marge, y + 3, largeur / 2 - marge - 6, 22);
  doc.rect(largeur / 2 + 6, y + 3, largeur / 2 - marge - 6, 22);
}

/** Enregistre le PDF : partage du téléphone (Imprimer, Fichiers, WhatsApp…) ou téléchargement dans un navigateur. */
async function enregistrerPdf(doc: Awaited<ReturnType<typeof nouveauDocumentA4>>["doc"], nom: string, titre: string) {
  if (!Capacitor.isNativePlatform()) {
    doc.save(nom);
    return;
  }
  const base64 = doc.output("datauristring").split(",")[1];
  const fichier = await Filesystem.writeFile({ path: `bons/${nom}`, data: base64, directory: Directory.Cache, recursive: true });
  await Share.share({ title: nom, files: [fichier.uri], dialogTitle: titre });
}

/**
 * Envoie le PDF à une imprimante classique : écran « Imprimer » d'Android
 * (imprimantes Wi-Fi, Mopria…). Dans un navigateur, boîte d'impression du navigateur.
 */
async function imprimerPdf(doc: Awaited<ReturnType<typeof nouveauDocumentA4>>["doc"], nom: string) {
  if (Capacitor.isNativePlatform()) {
    await PdfPrinter.print({ data: doc.output("datauristring").split(",")[1], name: nom });
    return;
  }
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

/** Construit le bon au format A4, comme le modèle papier de la société. */
export async function construireBonA4(bon: BonA4) {
  const { doc, autoTable, marge, largeur } = await nouveauDocumentA4();

  // Titre et numéro
  doc.setFontSize(13);
  doc.text(`${TITRES[bon.type]}  N° :  ${bon.numero}`, largeur / 2, 42, { align: "center" });

  // Bloc vendeur / véhicule (sortie et retour) ou date (entrée)
  let y = 54;
  const ligne = (libelle: string, valeur: string) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(libelle, marge, y);
    doc.setFont("helvetica", "normal");
    doc.text(valeur, marge + 42, y);
    y += 8;
  };
  ligne("Date :", new Date(bon.date).toLocaleDateString("fr-FR"));
  if (bon.vendeur) {
    ligne("Vendeur :", bon.vendeur.nom.toUpperCase());
    ligne("VOITURE :", bon.vendeur.voiture ?? "");
    ligne("Matricule :", bon.vendeur.matriculeVoiture ?? "");
  }

  const lignes = [...bon.lignes].sort((a, b) => a.article.code.localeCompare(b.article.code));
  const totalPieces = lignes.reduce((s, l) => s + l.pieces, 0);
  autoTable(doc, {
    startY: y + 2,
    margin: { left: marge, right: marge },
    head: [["Code", "Désignation", "Colisage", "Qte", "PRIX"]],
    body: lignes.map((l) => [
      l.article.code,
      designation(l.article),
      String(Number(l.article.colisage) || 1),
      String(l.pieces),
      prix(Number(l.article.prixVente)),
    ]),
    foot: [["", "Total", "", String(totalPieces), ""]],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, textColor: 20, lineColor: 40, lineWidth: 0.25, cellPadding: 1.8 },
    headStyles: { fillColor: 255, textColor: 20, fontStyle: "bold", halign: "center", fontSize: 11 },
    footStyles: { fillColor: 245, textColor: 20, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 24, fontStyle: "bold", halign: "center" },
      1: { fontStyle: "bold" },
      2: { cellWidth: 24, halign: "center", fontStyle: "bold" },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (c) => {
      // Comme le modèle : Désignation et PRIX sur fond bleu dans l'en-tête.
      if (c.section === "head" && (c.column.index === 1 || c.column.index === 4)) c.cell.styles.fillColor = BLEU;
      if (c.section === "foot" && c.column.index === 3) c.cell.styles.halign = "center";
    },
  });

  signatures(doc, marge, bon.type === "ENTREE" ? "Livré par" : "Magasinier", bon.type === "ENTREE" ? "Reçu par (dépôt)" : "Vendeur");
  return doc;
}

/**
 * Génère le bon en PDF A4 puis ouvre le partage du téléphone (Imprimer,
 * WhatsApp, e-mail…). Dans un navigateur, le PDF est téléchargé.
 */
export async function imprimerBonA4(bon: BonA4): Promise<void> {
  const doc = await construireBonA4(bon);
  const nom = `${bon.type === "ENTREE" ? "bon-entree" : bon.type === "SORTIE" ? "bon-sortie" : "bon-retour"}-${bon.numero.replace(/[^\w-]+/g, "_")}.pdf`;
  await enregistrerPdf(doc, nom, "Imprimer ou envoyer le bon");
}

/** Imprime le bon d'entrée / de sortie / de retour sur une imprimante A4. */
export async function imprimerBonImprimante(bon: BonA4): Promise<void> {
  await imprimerPdf(await construireBonA4(bon), `bon-${bon.type.toLowerCase()}-${bon.numero}`);
}

/* ---------------------------------------------------------------- Bon de livraison */

const MODES: Record<string, string> = { ESPECES: "Espèces", CHEQUE: "Chèque", VIREMENT: "Virement", TPE: "TPE" };

/** Bon de livraison (vente) au format A4 : client, lignes HT / TVA, totaux, règlement. */
export async function construireBonLivraisonA4(f: Facture) {
  const { doc, autoTable, marge, largeur } = await nouveauDocumentA4();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(`BON DE LIVRAISON  N° :  ${f.numero}`, largeur / 2, 42, { align: "center" });
  if (f.statut === "ANNULEE") {
    doc.setTextColor(176, 53, 42);
    doc.text("ANNULÉ", largeur / 2, 49, { align: "center" });
    doc.setTextColor(20);
  }

  // Client à gauche, date et vendeur à droite.
  const c = f.client;
  let y = 58;
  const champ = (libelle: string, valeur: string | null | undefined, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(libelle, x, yy);
    doc.setFont("helvetica", "normal");
    doc.text(valeur || "", x + 26, yy, { maxWidth: largeur / 2 - 34 });
  };
  champ("Client :", c?.nomCommerce ?? f.clientId, marge, y);
  champ("MF client :", c?.code, marge, y + 7);
  champ("Adresse :", [c?.adresse, c?.ville].filter(Boolean).join(", "), marge, y + 14);
  champ("Tél. :", c?.telephone, marge, y + 21);
  const droite = largeur / 2 + 10;
  champ("Date :", new Date(f.date).toLocaleDateString("fr-FR"), droite, y);
  champ("Vendeur :", f.vendeur?.nom, droite, y + 7);
  y += 30;

  autoTable(doc, {
    startY: y,
    margin: { left: marge, right: marge },
    head: [["Code", "Désignation", "Qté", "P.U. HT", "TVA", "Total HT"]],
    body: [...f.lignes]
      .sort((a, b) => a.article.code.localeCompare(b.article.code))
      .map((l) => [
        l.article.code,
        designation(l.article),
        String(Number(l.quantite)),
        prix(Number(l.prixUnitaire)),
        `${Number(l.tauxTva)} %`,
        prix(Number(l.montantHT)),
      ]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, textColor: 20, lineColor: 40, lineWidth: 0.25, cellPadding: 1.8 },
    headStyles: { fillColor: 255, textColor: 20, fontStyle: "bold", halign: "center", fontSize: 11 },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold", halign: "center" },
      1: { fontStyle: "bold" },
      2: { cellWidth: 16, halign: "center" },
      3: { cellWidth: 24, halign: "right" },
      4: { cellWidth: 16, halign: "center" },
      5: { cellWidth: 26, halign: "right", fontStyle: "bold" },
    },
    didParseCell: (cell) => {
      if (cell.section === "head" && (cell.column.index === 1 || cell.column.index === 5)) cell.cell.styles.fillColor = BLEU;
    },
  });

  // Totaux à droite, règlement à gauche.
  const apresLignes = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  autoTable(doc, {
    startY: apresLignes,
    margin: { left: largeur - marge - 76, right: marge },
    body: [
      ["Total HT", `${prix(Number(f.montantHT))} TND`],
      ["TVA", `${prix(Number(f.montantTVA))} TND`],
      ["Total TTC", `${prix(Number(f.montantTTC))} TND`],
    ],
    theme: "grid",
    styles: { font: "helvetica", fontSize: 10, textColor: 20, lineColor: 40, lineWidth: 0.25, cellPadding: 1.8 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 36 }, 1: { halign: "right", cellWidth: 40 } },
    didParseCell: (cell) => {
      if (cell.row.index === 2) {
        cell.cell.styles.fontStyle = "bold";
        cell.cell.styles.fillColor = BLEU;
      }
    },
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Règlement :", marge, apresLignes + 6);
  doc.setFont("helvetica", "normal");
  doc.text(
    f.typeVente === "CREDIT" ? "Crédit" : `Comptant – ${MODES[f.modePaiement ?? ""] ?? "-"}`,
    marge + 24,
    apresLignes + 6
  );

  signatures(doc, marge, "Signature client", "Vendeur", 12);
  return doc;
}

/** Imprime le bon de livraison sur une imprimante A4. */
export async function imprimerBonLivraisonImprimante(f: Facture): Promise<void> {
  await imprimerPdf(await construireBonLivraisonA4(f), `bon-livraison-${f.numero}`);
}

/** Télécharge le bon de livraison en A4 (partage du téléphone ou téléchargement navigateur). */
export async function telechargerBonLivraisonA4(f: Facture): Promise<void> {
  const doc = await construireBonLivraisonA4(f);
  await enregistrerPdf(doc, `bon-livraison-${f.numero.replace(/[^\w-]+/g, "_")}.pdf`, "Enregistrer ou envoyer le bon de livraison");
}
