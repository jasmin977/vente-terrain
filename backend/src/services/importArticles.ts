import { randomUUID } from "node:crypto";
import ExcelJS from "exceljs";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { cleCategorie } from "../lib/categories";
import { htDepuisMarge, htDepuisTTC, tauxDepuisPrix, TVA_PAR_CODE } from "../lib/tarifs";

// Import du catalogue depuis un fichier Excel (modèle de l'app, ou export du logiciel
// de gestion de la société : « Code article », « Ctva », « Fodec », « Prix Gros TTC »…).
//
// Le fichier peut compter plus d'un millier de lignes : tout est préparé en mémoire,
// puis écrit en quelques requêtes groupées (une fonction serverless doit finir en
// moins de 30 s) — jamais une requête par ligne.

/** Fichier inutilisable : message destiné à l'admin (réponse 400). */
export class ErreurImport extends Error {}

/* ---------------------------------------------------------------- Colonnes */

// Colonnes du modèle (première feuille, ligne 1 = en-têtes). L'ordre est libre ; les
// en-têtes sont reconnus sans accents ni majuscules.
export const COLONNES = [
  { cle: "codeBarre", titre: "Code-barres", requis: true, exemple: "6191234567890" },
  { cle: "code", titre: "Réf", requis: false, exemple: "010001" },
  { cle: "designation", titre: "Désignation", requis: true, exemple: "GEL CIRE" },
  { cle: "categorie", titre: "Catégorie", requis: false, exemple: "Cosmétiques" },
  { cle: "sousCategorie", titre: "Sous-catégorie", requis: false, exemple: "Coiffage (gel & cire)" },
  { cle: "marque", titre: "Marque", requis: false, exemple: "MR JOCKER" },
  { cle: "unit", titre: "Unité", requis: false, exemple: "160 ML" },
  { cle: "colisage", titre: "Colisage", requis: false, exemple: 6 },
  { cle: "stock", titre: "Stock", requis: false, exemple: 18 },
  { cle: "prixAchat", titre: "Prix achat HT", requis: false, exemple: 2.5 },
  { cle: "prixVenteTTC", titre: "Prix vente TTC", requis: false, exemple: 5.95 },
  { cle: "prixVente", titre: "Prix vente HT", requis: false, exemple: "" },
  { cle: "marge", titre: "Marge %", requis: false, exemple: "" },
  { cle: "prixGrosTTC", titre: "Prix gros TTC", requis: false, exemple: "" },
  { cle: "tva", titre: "TVA %", requis: false, exemple: 19 },
  { cle: "fodec", titre: "Fodec", requis: false, exemple: 0 },
  { cle: "img", titre: "Lien image", requis: false, exemple: "https://exemple.com/photos/gel-cire.jpg" },
] as const;

// Colonnes reconnues à l'import sans figurer dans le modèle.
type CleColonne = (typeof COLONNES)[number]["cle"] | "ctva" | "prixGrosHT" | "codeArticle";

// Précisions affichées dans la feuille « Consignes » du modèle.
const REMARQUES: Partial<Record<CleColonne, string>> = {
  categorie: "Catégorie de l'article (créée si elle n'existe pas). Vide : l'article reste à classer dans l'app.",
  sousCategorie: "Sous-catégorie, dans la catégorie ci-contre (créée si elle n'existe pas).",
  stock: "Quantité en pièces. Crée un bon d'entrée « Stock initial » ; ignorée pour un article qui a déjà eu du stock.",
  prixVenteTTC: "Prix de vente fixé TTC (prioritaire) ; le prix HT en est déduit.",
  prixVente: "Utilisé si Prix vente TTC est vide.",
  marge: "% du prix d'achat HT : donne le prix de vente si ni TTC ni HT ne sont renseignés.",
  prixGrosTTC: "Second tarif (facultatif).",
  tva: "Facultatif : déduite de Ctva ou des prix HT et TTC si elle manque (19 par défaut).",
  fodec: "1 pour un article soumis à la FODEC (1 % du prix HT), sinon 0.",
  img: "Adresse (http…) de la photo, affichée seulement aux utilisateurs en ligne. Vide : la photo actuelle est gardée.",
};

const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");

// En-tête du fichier → colonne correspondante.
const ALIAS: Record<string, CleColonne> = {
  code: "code",
  reference: "code",
  ref: "code",
  refarticle: "code",
  // « Code article » : code-barres du logiciel de gestion (voir resoudreColonnes).
  codearticle: "codeArticle",
  designation: "designation",
  categorie: "categorie",
  souscategorie: "sousCategorie",
  libelle: "designation",
  nom: "designation",
  produit: "designation",
  marque: "marque",
  unite: "unit",
  unit: "unit",
  contenance: "unit",
  colisage: "colisage",
  colis: "colisage",
  stock: "stock",
  qte: "stock",
  quantite: "stock",
  stockinitial: "stock",
  prixventettc: "prixVenteTTC",
  pvttc: "prixVenteTTC",
  "marge%": "marge",
  marge: "marge",
  ctva: "ctva",
  codetva: "ctva",
  prixventeht: "prixVente",
  prixvente: "prixVente",
  prix: "prixVente",
  pu: "prixVente",
  prixachatht: "prixAchat",
  prixachat: "prixAchat",
  prixgrosttc: "prixGrosTTC",
  prixgrosht: "prixGrosHT",
  tva: "tva",
  "tva%": "tva",
  tauxtva: "tva",
  fodec: "fodec",
  lienimage: "img",
  image: "img",
  photo: "img",
  urlimage: "img",
  imageurl: "img",
  lien: "img",
  codebarres: "codeBarre",
  codebarre: "codeBarre",
  ean: "codeBarre",
  gencod: "codeBarre",
};

// Valeur d'une cellule en texte (nombres, formules, texte enrichi…).
function texteCellule(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("result" in v) return texteCellule(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((r) => r.text).join("");
    if ("text" in v) return String(v.text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v).trim();
}

const nombre = (s: string | undefined) => (!s ? undefined : Number(s.replace(/\s/g, "").replace(",", ".")));

/** Modèle à remplir (une ligne d'exemple + feuille de consignes). */
export async function modeleArticles(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Articles");
  ws.columns = COLONNES.map((c) => ({ header: c.titre, key: c.cle, width: c.cle === "designation" ? 36 : 16 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(COLONNES.map((c) => [c.cle, c.exemple])));
  const consignes = wb.addWorksheet("Consignes");
  consignes.columns = [{ width: 18 }, { width: 70 }];
  consignes.addRows([
    ["Colonne", "Contenu"],
    ...COLONNES.map((c) => [c.titre, REMARQUES[c.cle] ?? (c.requis ? "Obligatoire" : "Facultatif")]),
    [],
    ["", "Une ligne par article. Un article déjà présent dans la société (même Réf, ou même code-barres si la Réf est vide) est mis à jour, sinon il est créé."],
    ["", "Prix en dinars (5,500 ou 5.5). Un prix de vente est nécessaire : Prix vente TTC, Prix vente HT, ou Marge % avec Prix achat HT. Colisage par défaut : 1."],
    ["", "Un export du logiciel de gestion (Code article, Ctva, Fodec, Prix vente TTC, Stock…) est aussi accepté tel quel."],
    ["", "Les photos s'ajoutent ensuite depuis la fiche de chaque article."],
  ]);
  consignes.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ---------------------------------------------------------------- Lecture */

export interface ResultatImport {
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; raison: string }[];
  /** Articles dont le stock du fichier a été versé au dépôt (bon « Stock initial »). */
  stockInitial: number;
  /** Articles dont le stock du fichier a été ignoré : ils ont déjà eu du stock. */
  stockIgnore: number;
  /** Articles dont le stock du fichier est négatif : ignoré (un stock initial ne peut pas l'être). */
  stockNegatif: number;
  /** Fichier « classement seul » : articles classés (sans autre modification). */
  classes?: number;
  /** Catégories et sous-catégories créées par ce fichier. */
  categoriesCreees: number;
  /** Articles de la société encore sans catégorie après l'import (à classer dans l'app). */
  sansCategorie: number;
}

interface LigneImport {
  categorie: string | null;
  sousCategorie: string | null;
  /** Numéro de ligne dans le fichier. */
  ligne: number;
  code: string | null;
  codeBarre: string;
  designation: string;
  marque: string | null;
  unit: string | null;
  colisage: number;
  prixAchat: number;
  prixVente: number;
  prixGros: number | null;
  tva: number;
  fodec: number;
  stock: number;
  img: string | null;
}

/** Colonnes présentes dans le fichier : numéro de colonne → colonne reconnue. */
function resoudreColonnes(ws: ExcelJS.Worksheet) {
  const parColonne = new Map<number, CleColonne>();
  ws.getRow(1).eachCell((cell, col) => {
    const cle = ALIAS[normaliser(texteCellule(cell.value))];
    if (cle) parColonne.set(col, cle);
  });
  // « Code article » est le code-barres de l'article (souvent un EAN-13) dans le
  // logiciel de gestion ; si le fichier a aussi une colonne « Code-barres », c'est la Réf.
  const aCodeBarres = [...parColonne.values()].includes("codeBarre");
  for (const [col, cle] of parColonne) if (cle === "codeArticle") parColonne.set(col, aCodeBarres ? "code" : "codeBarre");

  const presentes = new Set(parColonne.values());
  // Sans aucune colonne de prix mais avec une colonne Catégorie : fichier de classement seul.
  const sansPrix = !presentes.has("prixVenteTTC") && !presentes.has("prixVente") && !presentes.has("marge");
  const classementSeul = sansPrix && presentes.has("categorie");
  if (classementSeul) {
    if (!presentes.has("codeBarre") && !presentes.has("code")) throw new ErreurImport("Colonne manquante : Code-barres (ou Code article)");
    return { parColonne, classementSeul };
  }
  const manquantes = COLONNES.filter((c) => c.requis && !presentes.has(c.cle)).map((c) => c.titre);
  if (manquantes.length) {
    throw new ErreurImport(`Colonnes manquantes : ${manquantes.join(", ")} (téléchargez le modèle)`);
  }
  if (sansPrix) {
    throw new ErreurImport("Colonne de prix manquante : Prix vente TTC, Prix vente HT ou Marge % (téléchargez le modèle)");
  }
  return { parColonne, classementSeul };
}

/** Une ligne du fichier → article prêt à enregistrer, ou la raison du refus. */
function lireLigne(v: Record<string, string>, ligne: number): LigneImport | string {
  const code = v.code || null;
  const codeBarre = v.codeBarre;
  const designation = (v.designation ?? "").replace(/\s+/g, " ").trim();
  if (!codeBarre) return "code-barres manquant";
  if (!designation) return "désignation manquante";
  const categorie = (v.categorie ?? "").replace(/\s+/g, " ").trim() || null;
  const sousCategorie = (v.sousCategorie ?? "").replace(/\s+/g, " ").trim() || null;
  if (sousCategorie && !categorie) return "sous-catégorie sans catégorie";

  const prixAchat = nombre(v.prixAchat) ?? 0;
  const colisage = nombre(v.colisage) ?? 1;
  const stock = nombre(v.stock);
  const img = (v.img ?? "").trim();
  if (img && !/^https?:\/\/\S+$/i.test(img)) return "lien d'image invalide (il doit commencer par http)";
  const ttcSaisi = nombre(v.prixVenteTTC);
  const htSaisi = nombre(v.prixVente);
  const marge = nombre(v.marge);
  const fodec = (nombre(v.fodec) ?? 0) > 0 ? 1 : 0;

  // TVA : colonne « TVA % » ; sinon code « Ctva » ; sinon déduite des prix de vente
  // HT et TTC ; sinon 19.
  let tva = nombre(v.tva);
  if (tva === undefined && v.ctva) tva = TVA_PAR_CODE[v.ctva.trim()];
  if (tva === undefined && ttcSaisi !== undefined && htSaisi !== undefined) tva = tauxDepuisPrix(htSaisi, ttcSaisi, fodec);
  if (tva === undefined && v.ctva) return `code TVA ${v.ctva} inconnu (ajoutez la colonne TVA %)`;
  tva ??= 19;

  // Prix de vente HT : le TTC prime (prix fixé TTC), puis l'HT, puis la marge sur le prix d'achat.
  const prixVente =
    ttcSaisi !== undefined
      ? htDepuisTTC(ttcSaisi, tva, fodec)
      : htSaisi !== undefined
        ? htSaisi
        : marge !== undefined && prixAchat > 0
          ? htDepuisMarge(prixAchat, marge, tva, fodec)
          : undefined;
  if (prixVente === undefined) return "prix de vente manquant (Prix vente TTC, Prix vente HT, ou Marge % avec un prix d'achat)";
  if (!(prixVente >= 0)) return "prix de vente invalide";
  if (stock !== undefined && Number.isNaN(stock)) return "stock invalide";
  if (!(prixAchat >= 0)) return "prix d'achat invalide";
  if (!Number.isInteger(colisage) || colisage < 1) return "colisage invalide (nombre entier ≥ 1)";
  if (!(tva >= 0 && tva <= 100)) return "TVA invalide (0 à 100)";

  // Prix de gros : seulement s'il diffère du prix d'achat (le logiciel de gestion
  // recopie le prix d'achat quand aucun tarif de gros n'est défini).
  const grosTTC = nombre(v.prixGrosTTC);
  const grosHT = nombre(v.prixGrosHT);
  const gros = grosTTC !== undefined ? htDepuisTTC(grosTTC, tva, fodec) : grosHT;
  const prixGros = gros !== undefined && gros > 0 && Math.abs(gros - prixAchat) > 0.0005 ? gros : null;

  return {
    ligne,
    categorie,
    sousCategorie,
    code,
    codeBarre,
    designation,
    marque: v.marque || null,
    unit: v.unit || null,
    colisage,
    prixAchat,
    prixVente,
    prixGros,
    tva,
    fodec,
    img: img || null,
    // Stock en millièmes ; 0,000001 (résidu de calcul) devient 0.
    stock: stock === undefined ? 0 : Math.round(stock * 1000) / 1000,
  };
}

/* ---------------------------------------------------------------- Catégories */

interface NouvelleCategorie {
  id: string;
  nom: string;
  parentId: string | null;
  ordre: number;
}

/**
 * Catégories demandées par des lignes du fichier : celles qui n'existent pas encore sont à
 * créer (nom comparé sans accents ni majuscules) ; chaque article reçoit la plus précise
 * (sous-catégorie, sinon catégorie).
 */
async function preparerCategories(
  societeId: string,
  demandes: { id: string; categorie: string | null; sousCategorie: string | null }[],
) {
  const existantes = await prisma.categorie.findMany({ where: { societeId }, select: { id: true, nom: true, parentId: true, ordre: true } });
  const noeuds = new Map<string, string>(); // clé → id (« racine » ou « racine/sous »)
  const cleRacineDe = new Map<string, string>(); // id d'une catégorie principale → sa clé
  const prochainOrdre = new Map<string | null, number>();
  for (const c of existantes) {
    prochainOrdre.set(c.parentId, Math.max(prochainOrdre.get(c.parentId) ?? 0, c.ordre));
    if (!c.parentId) {
      noeuds.set(cleCategorie(c.nom), c.id);
      cleRacineDe.set(c.id, cleCategorie(c.nom));
    }
  }
  for (const c of existantes) if (c.parentId) noeuds.set(`${cleRacineDe.get(c.parentId) ?? c.parentId}/${cleCategorie(c.nom)}`, c.id);

  const nouvelles: NouvelleCategorie[] = [];
  const creer = (nom: string, parentId: string | null, cle: string) => {
    const id = randomUUID();
    const ordre = (prochainOrdre.get(parentId) ?? 0) + 1;
    prochainOrdre.set(parentId, ordre);
    nouvelles.push({ id, nom, parentId, ordre });
    noeuds.set(cle, id);
    return id;
  };
  const categorieDe = new Map<string, string>(); // id de l'article → id de sa catégorie
  for (const d of demandes) {
    if (!d.categorie) continue;
    const cleRacine = cleCategorie(d.categorie);
    const idRacine = noeuds.get(cleRacine) ?? creer(d.categorie, null, cleRacine);
    if (!d.sousCategorie) {
      categorieDe.set(d.id, idRacine);
      continue;
    }
    const cleSous = `${cleRacine}/${cleCategorie(d.sousCategorie)}`;
    categorieDe.set(d.id, noeuds.get(cleSous) ?? creer(d.sousCategorie, idRacine, cleSous));
  }
  return { categorieDe, nouvelles };
}

/** Crée les catégories (les principales avant les sous-catégories) : les articles s'y rattachent ensuite. */
async function creerCategories(tx: Prisma.TransactionClient, societeId: string, nouvelles: NouvelleCategorie[]) {
  for (const niveau of [nouvelles.filter((c) => !c.parentId), nouvelles.filter((c) => c.parentId)]) {
    if (niveau.length) await tx.categorie.createMany({ data: niveau.map((c) => ({ ...c, societeId })) });
  }
}

/** Articles encore à classer ; 0 pour une société qui n'utilise pas de catégories. */
async function articlesSansCategorie(societeId: string) {
  if ((await prisma.categorie.count({ where: { societeId } })) === 0) return 0;
  return prisma.article.count({ where: { societeId, deletedAt: null, categorieId: null } });
}

/**
 * Fichier « classement seul » (sans prix : code + Catégorie + Sous-catégorie) : classe les
 * articles déjà présents sans toucher à rien d'autre. Un article introuvable est signalé.
 */
async function classerSeulement(ws: ExcelJS.Worksheet, parColonne: Map<number, CleColonne>, societeId: string): Promise<ResultatImport> {
  const erreurs: { ligne: number; raison: string }[] = [];
  const existants = await prisma.article.findMany({ where: { societeId }, select: { id: true, code: true, codeBarre: true, deletedAt: true } });
  const parCode = new Map(existants.filter((a) => a.code).map((a) => [a.code!, a.id]));
  const parCodeBarre = new Map<string, { id: string; supprime: boolean }>();
  for (const a of existants) {
    const deja = a.codeBarre ? parCodeBarre.get(a.codeBarre) : undefined;
    if (a.codeBarre && (!deja || (deja.supprime && !a.deletedAt))) parCodeBarre.set(a.codeBarre, { id: a.id, supprime: Boolean(a.deletedAt) });
  }

  const demandes: { id: string; categorie: string | null; sousCategorie: string | null }[] = [];
  const vus = new Set<string>();
  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const v: Record<string, string> = {};
    parColonne.forEach((cle, col) => (v[cle] = texteCellule(row.getCell(col).value)));
    if (Object.values(v).every((x) => !x)) continue;
    const categorie = (v.categorie ?? "").replace(/\s+/g, " ").trim() || null;
    const sousCategorie = (v.sousCategorie ?? "").replace(/\s+/g, " ").trim() || null;
    const id = v.code ? parCode.get(v.code) : v.codeBarre ? parCodeBarre.get(v.codeBarre)?.id : undefined;
    const raison = !v.codeBarre && !v.code
      ? "code article manquant"
      : !id
        ? "article introuvable"
        : !categorie
          ? sousCategorie ? "sous-catégorie sans catégorie" : null
          : vus.has(id)
            ? "article en double dans le fichier"
            : null;
    if (raison) {
      erreurs.push({ ligne: n, raison });
      continue;
    }
    if (!categorie || !id) continue; // ligne sans catégorie : rien à classer
    vus.add(id);
    demandes.push({ id, categorie, sousCategorie });
  }

  const { categorieDe, nouvelles } = await preparerCategories(societeId, demandes);
  await prisma.$transaction(
    async (tx) => {
      await creerCategories(tx, societeId, nouvelles);
      for (const lot of paquets(demandes)) {
        await tx.$executeRaw`
          UPDATE "articles" a SET "categorieId" = v.categorie, "updatedAt" = now()
          FROM unnest(${lot.map((d) => d.id)}::text[], ${lot.map((d) => categorieDe.get(d.id) ?? null)}::text[]) AS v(id, categorie)
          WHERE a.id = v.id AND a."societeId" = ${societeId}`;
      }
    },
    { maxWait: 10_000, timeout: 25_000 },
  );
  const sansCategorie = await articlesSansCategorie(societeId);
  return { crees: 0, misAJour: 0, classes: demandes.length, erreurs, stockInitial: 0, stockIgnore: 0, stockNegatif: 0, categoriesCreees: nouvelles.length, sansCategorie };
}

/* ---------------------------------------------------------------- Import */

const PAQUET = 400;
const paquets = <T>(liste: T[]) => Array.from({ length: Math.ceil(liste.length / PAQUET) }, (_, i) => liste.slice(i * PAQUET, (i + 1) * PAQUET));

/**
 * Crée les nouveaux articles de la société et met à jour ceux déjà présents (même Réf ;
 * sans Réf, même code-barres). Les lignes invalides sont ignorées et signalées (numéro de
 * ligne + raison) sans bloquer les autres.
 *
 * - Ordre : les articles gardent l'ordre des lignes du fichier. Un fichier qui contient
 *   tout le catalogue fixe l'ordre ; un fichier partiel laisse les articles existants à
 *   leur place et ajoute les nouveaux à la suite.
 * - Stock : versé une seule fois, par un bon d'entrée « Stock initial », aux articles qui
 *   n'ont encore jamais eu de mouvement au dépôt — réimporter ne double jamais les quantités.
 */
export async function importerArticles(fichierBase64: string, societeId: string, adminId: string): Promise<ResultatImport> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(fichierBase64, "base64") as unknown as ExcelJS.Buffer);
  } catch {
    throw new ErreurImport("Fichier illisible : envoyez un fichier Excel .xlsx");
  }
  if (!wb.worksheets.length) throw new ErreurImport("Le fichier ne contient aucune feuille");
  // La feuille des articles : la première dont les en-têtes sont reconnus (le classeur peut avoir une feuille
  // de résumé ou de consignes avant). Aucune : l'erreur porte sur la première feuille.
  let ws = wb.worksheets[0];
  let colonnes: ReturnType<typeof resoudreColonnes> | null = null;
  for (const feuille of wb.worksheets) {
    try {
      colonnes = resoudreColonnes(feuille);
      ws = feuille;
      break;
    } catch (err) {
      if (!(err instanceof ErreurImport)) throw err;
    }
  }
  const { parColonne, classementSeul } = colonnes ?? resoudreColonnes(ws);
  if (classementSeul) return classerSeulement(ws, parColonne, societeId);

  // Lecture du fichier.
  const erreurs: { ligne: number; raison: string }[] = [];
  const lignes: LigneImport[] = [];
  const vus = new Set<string>();
  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const v: Record<string, string> = {};
    parColonne.forEach((cle, col) => (v[cle] = texteCellule(row.getCell(col).value)));
    if (Object.values(v).every((x) => !x)) continue; // ligne vide

    const lue = lireLigne(v, n);
    if (typeof lue === "string") {
      erreurs.push({ ligne: n, raison: lue });
      continue;
    }
    const cle = lue.code ? `ref:${lue.code}` : `cb:${lue.codeBarre}`;
    if (vus.has(cle)) {
      erreurs.push({ ligne: n, raison: lue.code ? `réf ${lue.code} en double dans le fichier` : `code-barres ${lue.codeBarre} en double dans le fichier` });
      continue;
    }
    vus.add(cle);
    lignes.push(lue);
  }

  // Articles déjà présents : par Réf, sinon par code-barres (article actif de préférence).
  const existants = await prisma.article.findMany({
    where: { societeId },
    select: { id: true, code: true, codeBarre: true, deletedAt: true },
    orderBy: { createdAt: "asc" },
  });
  const parCode = new Map<string, string>();
  const parCodeBarre = new Map<string, { id: string; supprime: boolean }>();
  for (const a of existants) {
    if (a.code) parCode.set(a.code, a.id);
    const deja = a.codeBarre ? parCodeBarre.get(a.codeBarre) : undefined;
    if (a.codeBarre && (!deja || (deja.supprime && !a.deletedAt))) parCodeBarre.set(a.codeBarre, { id: a.id, supprime: Boolean(a.deletedAt) });
  }
  const actifs = new Set(existants.filter((a) => !a.deletedAt).map((a) => a.id));

  // Création ou mise à jour de chaque ligne ; une ligne qui vise un article déjà traité est refusée.
  type Preparee = LigneImport & { id: string; nouveau: boolean };
  const articles: Preparee[] = [];
  const ids = new Set<string>();
  for (const l of lignes) {
    const existant = l.code ? parCode.get(l.code) : parCodeBarre.get(l.codeBarre)?.id;
    if (existant && ids.has(existant)) {
      erreurs.push({ ligne: l.ligne, raison: "même article qu'une autre ligne du fichier" });
      continue;
    }
    const id = existant ?? randomUUID();
    ids.add(id);
    articles.push({ ...l, id, nouveau: !existant });
  }
  erreurs.sort((a, b) => a.ligne - b.ligne);

  // Ordre : fichier complet → ordre du fichier ; fichier partiel → nouveaux articles à la suite.
  const complet = [...actifs].every((id) => ids.has(id));
  let ordreDepart = 1;
  if (!complet) {
    const { _max } = await prisma.article.aggregate({ where: { societeId }, _max: { ordre: true } });
    ordreDepart = (_max.ordre ?? 0) + 1;
  }
  const ordre = new Map<string, number>();
  let suivant = ordreDepart;
  for (const a of articles) if (complet || a.nouveau) ordre.set(a.id, suivant++);

  const aCreer = articles.filter((a) => a.nouveau);
  const aMettreAJour = articles.filter((a) => !a.nouveau);

  // Catégories du fichier : créées si elles n'existent pas, l'article reçoit la plus précise.
  const { categorieDe, nouvelles: nouvellesCategories } = await preparerCategories(societeId, articles);

  // Stock : articles du fichier avec une quantité > 0, jamais approvisionnés.
  const avecStock = articles.filter((a) => a.stock > 0);
  const stockNegatif = articles.filter((a) => a.stock < 0).length;
  const dejaServis = new Set(
    avecStock.length
      ? (
          await prisma.mouvementDepot.findMany({
            where: { articleId: { in: avecStock.filter((a) => !a.nouveau).map((a) => a.id) } },
            select: { articleId: true },
            distinct: ["articleId"],
          })
        ).map((m) => m.articleId)
      : [],
  );
  const aVerser = avecStock.filter((a) => !dejaServis.has(a.id));

  await prisma.$transaction(
    async (tx) => {
      await creerCategories(tx, societeId, nouvellesCategories);
      for (const lot of paquets(aCreer)) {
        await tx.article.createMany({
          data: lot.map((a) => ({
            id: a.id,
            societeId,
            code: a.code,
            codeBarre: a.codeBarre,
            designation: a.designation,
            marque: a.marque,
            unit: a.unit,
            colisage: a.colisage,
            prixAchat: a.prixAchat,
            prixVente: a.prixVente,
            prixGros: a.prixGros,
            tva: a.tva,
            fodec: a.fodec,
            img: a.img,
            categorieId: categorieDe.get(a.id) ?? null,
            ordre: ordre.get(a.id) ?? null,
          })),
        });
      }

      // Historique : nouveau prix noté pour les articles créés, et pour ceux dont un prix change.
      for (const lot of paquets(aCreer)) {
        await tx.historiquePrix.createMany({
          data: lot.map((a) => ({ articleId: a.id, prixAchat: a.prixAchat, prixVente: a.prixVente, tva: a.tva, fodec: a.fodec, source: "CREATION" as const, adminId })),
        });
      }
      for (const lot of paquets(aMettreAJour)) {
        await tx.$executeRaw`
          INSERT INTO "prix_historique" ("id", "articleId", "prixAchat", "prixVente", "tva", "fodec", "source", "adminId")
          SELECT gen_random_uuid()::text, v.id, v.achat, v.vente, v.tva, v.fodec, 'IMPORT'::"SourcePrix", ${adminId}
          FROM unnest(
            ${lot.map((a) => a.id)}::text[],
            ${lot.map((a) => a.prixAchat)}::numeric[],
            ${lot.map((a) => a.prixVente)}::numeric[],
            ${lot.map((a) => a.tva)}::numeric[],
            ${lot.map((a) => a.fodec)}::numeric[]
          ) AS v(id, achat, vente, tva, fodec)
          JOIN "articles" a ON a.id = v.id AND a."societeId" = ${societeId}
          WHERE a."prixAchat" <> round(v.achat, 3) OR a."prixVente" <> round(v.vente, 6) OR a."tva" <> v.tva OR a."fodec" <> v.fodec`;
        await tx.$executeRaw`
          UPDATE "articles" a SET
            "designation" = v.designation,
            "marque" = v.marque,
            "unit" = v.unit,
            "codeBarre" = v."codeBarre",
            "code" = COALESCE(v.code, a."code"),
            "colisage" = v.colisage,
            "prixAchat" = v."prixAchat",
            "prixVente" = v."prixVente",
            "prixGros" = v."prixGros",
            "tva" = v.tva,
            "fodec" = v.fodec,
            "img" = COALESCE(v.img, a."img"),
            "categorieId" = COALESCE(v.categorie, a."categorieId"),
            "ordre" = COALESCE(v.ordre, a."ordre"),
            "deletedAt" = NULL,
            "updatedAt" = now()
          FROM unnest(
            ${lot.map((a) => a.id)}::text[],
            ${lot.map((a) => a.designation)}::text[],
            ${lot.map((a) => a.marque)}::text[],
            ${lot.map((a) => a.unit)}::text[],
            ${lot.map((a) => a.codeBarre)}::text[],
            ${lot.map((a) => a.code)}::text[],
            ${lot.map((a) => a.colisage)}::int[],
            ${lot.map((a) => a.prixAchat)}::numeric[],
            ${lot.map((a) => a.prixVente)}::numeric[],
            ${lot.map((a) => a.prixGros)}::numeric[],
            ${lot.map((a) => a.tva)}::numeric[],
            ${lot.map((a) => a.fodec)}::numeric[],
            ${lot.map((a) => categorieDe.get(a.id) ?? null)}::text[],
            ${lot.map((a) => ordre.get(a.id) ?? null)}::int[],
            ${lot.map((a) => a.img)}::text[]
          ) AS v(id, designation, marque, unit, "codeBarre", code, colisage, "prixAchat", "prixVente", "prixGros", tva, fodec, categorie, ordre, img)
          WHERE a.id = v.id AND a."societeId" = ${societeId}`;
      }

      // Fichier complet : les articles qui n'y figurent pas passent en fin de liste.
      if (complet) {
        await tx.article.updateMany({ where: { societeId, id: { notIn: [...ids] } }, data: { ordre: null } });
      }

      if (aVerser.length) {
        const reference = "Stock initial";
        const doc = await tx.entreeDepot.create({ data: { reference, adminId, societeId } });
        for (const lot of paquets(aVerser)) {
          await tx.$executeRaw`
            INSERT INTO "stock_depot" ("id", "articleId", "quantite", "updatedAt")
            SELECT v.id, v.aid, v.q, now()
            FROM unnest(${lot.map(() => randomUUID())}::text[], ${lot.map((a) => a.id)}::text[], ${lot.map((a) => a.stock)}::numeric[]) AS v(id, aid, q)
            ON CONFLICT ("articleId") DO UPDATE SET "quantite" = "stock_depot"."quantite" + EXCLUDED."quantite", "updatedAt" = now()`;
          await tx.ligneEntreeDepot.createMany({ data: lot.map((a) => ({ entreeId: doc.id, articleId: a.id, quantite: a.stock })) });
          // Stock initial : lots sans date (ces articles n'avaient aucun mouvement, donc aucun lot).
          await tx.lotDepot.createMany({
            data: lot.filter((a) => a.stock > 0).map((a) => ({ articleId: a.id, dateExpiration: null, quantite: a.stock, entreeId: doc.id })),
          });
          await tx.mouvementDepot.createMany({
            data: lot.map((a) => ({ articleId: a.id, sens: "ENTREE" as const, quantite: a.stock, reference, entreeId: doc.id })),
          });
        }
      }
    },
    { maxWait: 10_000, timeout: 25_000 },
  );

  const sansCategorie = await articlesSansCategorie(societeId);

  return {
    crees: aCreer.length,
    misAJour: aMettreAJour.length,
    erreurs,
    stockInitial: aVerser.length,
    stockIgnore: avecStock.length - aVerser.length,
    stockNegatif,
    categoriesCreees: nouvellesCategories.length,
    sansCategorie,
  };
}
