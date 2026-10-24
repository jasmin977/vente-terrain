import type { jsPDF as JsPDF } from "jspdf";
import { montantEnLettres } from "./montantEnLettres";
import { formatDate } from "./format";
import { urlImage } from "../offline/images";

/** Qui émet la facture (en-tête à gauche). */
export interface EmetteurFacture {
  nom: string;
  activite?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  email?: string | null;
  matriculeFiscal?: string | null;
  logo?: string | null;
}

/** À qui elle est adressée (cadre à droite). */
export interface DestinataireFacture {
  nom: string;
  matriculeFiscal?: string | null;
  adresse?: string | null;
  telephone?: string | null;
}

export type LigneModele =
  | { titre: string }
  | { codeBarre?: string | null; designation: string; quantite: number; tauxTva: number; prixHT: number; montantHT: number; montantTTC: number };

export interface ModeleFacture {
  numero: string;
  date: string;
  emetteur: EmetteurFacture;
  destinataire: DestinataireFacture;
  lignes: LigneModele[];
  timbre: number;
  modeReglement?: string;
}

// Mise en page (mm, A4 210 × 297).
const G = 8;
const D = 202;
const BLEU: [number, number, number] = [204, 228, 247];
const BLEU_FONCE: [number, number, number] = [20, 70, 200];
const COL = { code: G, designation: G + 29, qte: 135.5, tva: 147, prix: 158, ttc: 178, fin: D };
const HAUT_TABLE = 57;
const BAS_TABLE = 226;
const H_ENTETE = 6.5;
const H_LIGNE = 6.5;

const nombre = (n: number, decimales = 3) => n.toFixed(decimales).replace(".", ",");
const estTitre = (l: LigneModele): l is { titre: string } => "titre" in l;

/** Image (logo) en data URL, ou null si elle ne se charge pas. */
async function chargerImage(src: string | null | undefined): Promise<{ data: string; l: number; h: number } | null> {
  const url = urlImage(src);
  if (!url) return null;
  try {
    const blob = await (await fetch(url)).blob();
    const data = await new Promise<string>((ok, ko) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result));
      r.onerror = ko;
      r.readAsDataURL(blob);
    });
    const dims = await new Promise<{ l: number; h: number }>((ok, ko) => {
      const img = new Image();
      img.onload = () => ok({ l: img.naturalWidth, h: img.naturalHeight });
      img.onerror = ko;
      img.src = data;
    });
    return { data, ...dims };
  } catch {
    return null;
  }
}

function cellule(doc: JsPDF, x: number, y: number, l: number, h: number, texte: string, opts: { fond?: boolean; gras?: boolean; align?: "left" | "right" | "center"; taille?: number } = {}) {
  if (opts.fond) {
    doc.setFillColor(...BLEU);
    doc.rect(x, y, l, h, "FD");
  } else doc.rect(x, y, l, h);
  doc.setFont("helvetica", opts.gras ? "bold" : "normal");
  doc.setFontSize(opts.taille ?? 9);
  const align = opts.align ?? "left";
  const tx = align === "left" ? x + 1.5 : align === "right" ? x + l - 1.5 : x + l / 2;
  doc.text(texte, tx, y + h / 2 + 1.2, { align });
}

/** En-tête de chaque page : société, titre, N° / date, cadre du destinataire. */
function entete(doc: JsPDF, m: ModeleFacture, logo: Awaited<ReturnType<typeof chargerImage>>, page: number, pages: number) {
  const e = m.emetteur;
  let xTexte = G;
  if (logo) {
    const max = { l: 34, h: 22 };
    const r = Math.min(max.l / logo.l, max.h / logo.h);
    doc.addImage(logo.data, G, 8, logo.l * r, logo.h * r);
    xTexte = G + 37;
  }
  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(e.nom, xTexte, 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  const infos = [e.activite, e.adresse, e.telephone && `Tél : ${e.telephone}`, e.email && `Email : ${e.email}`, e.matriculeFiscal && `M.F : ${e.matriculeFiscal}`].filter(Boolean) as string[];
  infos.forEach((t, i) => doc.text(t, xTexte, 14.5 + i * 3.3));

  doc.setFontSize(8);
  doc.text(`${pages} Page(s)`, D - 2, 11, { align: "right" });

  if (e.telephone) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(e.telephone.split(/[/,]/)[0].trim(), G + 2, 35);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Facture", 47, 41.5, { align: "center" });

  // N° / Date / Client
  doc.setDrawColor(40);
  doc.setLineWidth(0.25);
  const yt = 43.5;
  const cols = [
    { titre: "N°", valeur: m.numero, l: 24 },
    { titre: "Date", valeur: formatDate(m.date), l: 25 },
    { titre: "Client", valeur: "", l: 29 },
  ];
  let x = G;
  for (const c of cols) {
    cellule(doc, x, yt, c.l, 5.5, c.titre, { fond: true, gras: true });
    cellule(doc, x, yt + 5.5, c.l, 6, c.valeur, { gras: true, align: c.titre === "Client" ? "left" : "right" });
    x += c.l;
  }

  // Destinataire
  const d = m.destinataire;
  doc.roundedRect(90, 28, D - 90, 27, 2.5, 2.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(d.nom, (90 + D) / 2, 33, { align: "center" });
  const lignesDest: [string, string][] = [
    ["Matricule fiscal :", d.matriculeFiscal ?? ""],
    ["Adresse:", d.adresse ?? ""],
    ["Téléphone:", d.telephone ?? ""],
  ];
  lignesDest.forEach(([libelle, valeur], i) => {
    const y = 39.5 + i * 6.5;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(libelle, 93, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(valeur, D - 122)[0] ?? "", 116, y);
  });

  // Pied de page
  doc.setLineWidth(0.2);
  doc.line(G, 288, D, 288);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`Facture N° ${m.numero} pour ${d.nom}`, G + 2, 292.5);
  doc.text(`Page ${page}/${pages}`, D - 2, 292.5, { align: "right" });
}

/** Cadre des lignes : en-tête bleu et colonnes jusqu'en bas de la zone. */
function cadreLignes(doc: JsPDF, bas: number) {
  doc.setLineWidth(0.25);
  doc.setFillColor(...BLEU);
  doc.rect(G, HAUT_TABLE, D - G, H_ENTETE, "F");
  doc.rect(G, HAUT_TABLE, D - G, bas - HAUT_TABLE);
  doc.line(G, HAUT_TABLE + H_ENTETE, D, HAUT_TABLE + H_ENTETE);
  for (const x of [COL.designation, COL.qte, COL.tva, COL.prix, COL.ttc]) doc.line(x, HAUT_TABLE, x, bas);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  const y = HAUT_TABLE + 4.6;
  doc.text("Code-barres", (COL.code + COL.designation) / 2, y, { align: "center" });
  doc.text("Désignation", COL.designation + 1.5, y);
  doc.text("Qte", (COL.qte + COL.tva) / 2, y, { align: "center" });
  doc.text("TVA", (COL.tva + COL.prix) / 2, y, { align: "center" });
  doc.text("Prix", (COL.prix + COL.ttc) / 2, y, { align: "center" });
  doc.text("Total TTC", (COL.ttc + D) / 2, y, { align: "center" });
}

/** Facture A4 au modèle de la société : en-tête, lignes, ventilation de la TVA, totaux, timbre, net à payer en lettres. */
export async function construireFactureModele(m: ModeleFacture): Promise<JsPDF> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await chargerImage(m.emetteur.logo);

  // Répartition des lignes par page : la dernière garde la place des totaux, les autres vont plus bas.
  const parPagePleine = Math.floor((280 - HAUT_TABLE - H_ENTETE) / H_LIGNE);
  const parDernierePage = Math.floor((BAS_TABLE - HAUT_TABLE - H_ENTETE) / H_LIGNE);
  const pagesLignes: LigneModele[][] = [];
  let reste = [...m.lignes];
  while (reste.length > parDernierePage) {
    pagesLignes.push(reste.slice(0, parPagePleine));
    reste = reste.slice(parPagePleine);
  }
  pagesLignes.push(reste);
  const nbPages = pagesLignes.length;

  pagesLignes.forEach((lignes, i) => {
    if (i > 0) doc.addPage();
    const derniere = i === nbPages - 1;
    entete(doc, m, logo, i + 1, nbPages);
    const bas = derniere ? BAS_TABLE : 280;
    cadreLignes(doc, bas);
    let y = HAUT_TABLE + H_ENTETE;
    for (const l of lignes) {
      const base = y + H_LIGNE / 2 + 1.3;
      doc.setDrawColor(215);
      doc.line(G, y + H_LIGNE, D, y + H_LIGNE);
      doc.setDrawColor(40);
      if (estTitre(l)) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.text(l.titre, COL.designation + 1.5, base);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setFontSize(8);
        doc.text(l.codeBarre ?? "", (COL.code + COL.designation) / 2, base, { align: "center" });
        doc.setFontSize(9);
        doc.text(doc.splitTextToSize(l.designation, COL.qte - COL.designation - 3)[0] ?? "", COL.designation + 1.5, base);
        doc.text(String(Number(l.quantite.toFixed(3))), COL.tva - 1.5, base, { align: "right" });
        doc.text(String(Number(l.tauxTva)), COL.prix - 1.5, base, { align: "right" });
        doc.text(nombre(l.prixHT), COL.ttc - 1.5, base, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.text(nombre(l.montantTTC), D - 1.5, base, { align: "right" });
      }
      y += H_LIGNE;
    }
  });

  // Totaux (dernière page).
  const articles = m.lignes.filter((l): l is Exclude<LigneModele, { titre: string }> => !estTitre(l));
  const totalHT = articles.reduce((s, l) => s + l.montantHT, 0);
  const totalTTC = articles.reduce((s, l) => s + l.montantTTC, 0);
  const totalTVA = totalTTC - totalHT;
  const qte = articles.reduce((s, l) => s + l.quantite, 0);
  const net = totalTTC + m.timbre;

  doc.setTextColor(20);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text(String(articles.length), G + 1.5, BAS_TABLE + 5);
  doc.text(nombre(qte, 2), COL.tva - 1.5, BAS_TABLE + 5, { align: "right" });
  doc.setLineWidth(0.25);
  doc.rect(COL.ttc, BAS_TABLE + 1.5, D - COL.ttc, 5.5);
  doc.text(nombre(totalTTC), D - 2, BAS_TABLE + 5.3, { align: "right" });

  // Ventilation de la TVA par taux.
  const yb = 241;
  const parTaux = new Map<number, { base: number; tva: number }>();
  for (const l of articles) {
    const t = parTaux.get(l.tauxTva) ?? { base: 0, tva: 0 };
    t.base += l.montantHT;
    t.tva += l.montantTTC - l.montantHT;
    parTaux.set(l.tauxTva, t);
  }
  cellule(doc, G, yb, 27, 5.5, "Base", { fond: true, gras: true, align: "center" });
  cellule(doc, G + 27, yb, 21, 5.5, "Taux TVA", { fond: true, gras: true, align: "center" });
  cellule(doc, G + 48, yb, 30, 5.5, "Montant TVA", { fond: true, gras: true, align: "center" });
  doc.rect(G, yb + 5.5, 27, 21);
  doc.rect(G + 27, yb + 5.5, 21, 21);
  doc.rect(G + 48, yb + 5.5, 30, 21);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  [...parTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .slice(0, 5)
    .forEach(([taux, v], i) => {
      const y = yb + 9.5 + i * 3.6;
      doc.text(v.base.toFixed(3), G + 25.5, y, { align: "right" });
      doc.text(taux.toFixed(3), G + 46.5, y, { align: "right" });
      doc.text(v.tva.toFixed(3), G + 76.5, y, { align: "right" });
    });

  // Totaux du milieu.
  const xm = G + 80;
  const totaux: [string, number][] = [
    ["Total remise", 0],
    ["Total TVA", totalTVA],
    ["Total HT", totalHT],
    ["Timbre", m.timbre],
    ["FODEC", 0],
  ];
  totaux.forEach(([libelle, valeur], i) => {
    const y = yb + i * 6.4;
    cellule(doc, xm, yb + i * 6.4, 27, 6, libelle, { fond: true, gras: true });
    cellule(doc, xm + 27, y, 24, 6, nombre(valeur), { align: "right", taille: 8.5 });
  });

  // Net à payer, mode de règlement, cadre (cachet / signature).
  const xn = 140;
  cellule(doc, xn, yb, 25, 6.5, "Net à payer", { fond: true, gras: true, taille: 9.5 });
  doc.rect(xn + 25, yb, D - xn - 25, 6.5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(...BLEU_FONCE);
  doc.text(nombre(net), D - 2, yb + 5.2, { align: "right" });
  doc.setTextColor(20);
  cellule(doc, xn, yb + 9, 33, 6, "Mode règlement", { fond: true, gras: true, taille: 8.5 });
  cellule(doc, xn + 33, yb + 9, D - xn - 33, 6, m.modeReglement ?? "", { taille: 8.5 });
  doc.roundedRect(xn, yb + 17.5, D - xn, 15, 2, 2);

  // Montant en lettres.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Arrêtée la présente à la somme de :", G + 2, 278.5);
  doc.setFont("times", "bolditalic");
  doc.setFontSize(13);
  doc.text(doc.splitTextToSize(montantEnLettres(net), D - G - 4)[0] ?? "", G + 2, 284);
  doc.setLineWidth(0.2);
  doc.line(G, 285.5, D, 285.5);

  return doc;
}
