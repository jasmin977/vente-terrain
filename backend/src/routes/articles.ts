import { Router } from "express";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

export const articlesRouter = Router();
articlesRouter.use(requireAuth, requireSociete);

const codeDejaPris = (err: unknown) => err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

// Module 1 - Gestion des Articles : recherche sur désignation, marque, unité,
// code et code-barres. Chaque mot saisi doit se retrouver dans l'un de ces
// champs (« cire orange » trouve « CIRE-WAX ORANGE »).
const CHAMPS_RECHERCHE = ["designation", "marque", "unit", "code", "codeBarre"] as const;
articlesRouter.get("/", async (req, res) => {
  const { q, codeBarre } = req.query as Record<string, string | undefined>;

  const articles = await prisma.article.findMany({
    where: {
      societeId: req.societeId,
      deletedAt: null,
      ...(codeBarre ? { codeBarre } : {}),
      ...(q?.trim()
        ? {
            AND: q
              .trim()
              .split(/\s+/)
              .map((mot) => ({
                OR: CHAMPS_RECHERCHE.map((champ) => ({ [champ]: { contains: mot, mode: "insensitive" as const } })),
              })),
          }
        : {}),
    },
    orderBy: { designation: "asc" },
    take: 1000,
  });
  res.json(articles);
});

/* ---------------------------------------------------------------- Import Excel */

// Colonnes du fichier d'import (première feuille, ligne 1 = en-têtes). L'ordre
// des colonnes est libre ; les en-têtes sont reconnus sans accents ni majuscules.
const COLONNES = [
  { cle: "code", titre: "Code", requis: true, exemple: "010001" },
  { cle: "designation", titre: "Désignation", requis: true, exemple: "GEL CIRE" },
  { cle: "marque", titre: "Marque", requis: false, exemple: "MR JOCKER" },
  { cle: "unit", titre: "Unité", requis: false, exemple: "160 ML" },
  { cle: "colisage", titre: "Colisage", requis: false, exemple: 6 },
  { cle: "prixVente", titre: "Prix vente HT", requis: true, exemple: 5 },
  { cle: "prixAchat", titre: "Prix achat HT", requis: false, exemple: 2.5 },
  { cle: "tva", titre: "TVA %", requis: false, exemple: 19 },
  { cle: "codeBarre", titre: "Code-barres", requis: false, exemple: "6191234567890" },
] as const;

const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]/g, "");

// Un en-tête du fichier → la colonne correspondante (« Prix vente », « PRIX » acceptés).
function colonneDe(entete: string) {
  const e = normaliser(entete);
  if (!e) return undefined;
  const alias: Record<string, (typeof COLONNES)[number]["cle"]> = {
    code: "code", codearticle: "code", reference: "code", ref: "code",
    designation: "designation", libelle: "designation", nom: "designation", produit: "designation",
    marque: "marque", unite: "unit", unit: "unit", contenance: "unit",
    colisage: "colisage", colis: "colisage",
    prixventeht: "prixVente", prixvente: "prixVente", prix: "prixVente", pu: "prixVente",
    prixachatht: "prixAchat", prixachat: "prixAchat",
    tva: "tva", "tva%": "tva", tauxtva: "tva",
    codebarres: "codeBarre", codebarre: "codeBarre", ean: "codeBarre",
  };
  return alias[e];
}

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

const nombre = (s: string) => (s === "" ? undefined : Number(s.replace(/\s/g, "").replace(",", ".")));

/** Modèle à remplir (une ligne d'exemple). */
articlesRouter.get("/modele", requireAdmin, async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Articles");
  ws.columns = COLONNES.map((c) => ({ header: c.titre, key: c.cle, width: c.cle === "designation" ? 36 : 16 }));
  ws.getRow(1).font = { bold: true };
  ws.addRow(Object.fromEntries(COLONNES.map((c) => [c.cle, c.exemple])));
  const consignes = wb.addWorksheet("Consignes");
  consignes.columns = [{ width: 18 }, { width: 70 }];
  consignes.addRows([
    ["Colonne", "Contenu"],
    ...COLONNES.map((c) => [c.titre, c.requis ? "Obligatoire" : "Facultatif"]),
    [],
    ["", "Une ligne par article. Un code déjà présent dans la société est mis à jour, sinon l'article est créé."],
    ["", "Prix en dinars (5,500 ou 5.5). TVA par défaut : 19. Colisage par défaut : 1."],
    ["", "Les photos s'ajoutent ensuite depuis la fiche de chaque article."],
  ]);
  consignes.getRow(1).font = { bold: true };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="modele-articles.xlsx"');
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});

const importSchema = z.object({ fichier: z.string().min(1) }); // .xlsx en base64

/**
 * Import du catalogue depuis un fichier Excel : crée les nouveaux codes, met à
 * jour les codes existants de la société. Les lignes invalides sont ignorées et
 * signalées (numéro de ligne + raison) sans bloquer les autres.
 */
articlesRouter.post("/import", requireAdmin, async (req, res) => {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Fichier manquant" });
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(parsed.data.fichier, "base64") as unknown as ExcelJS.Buffer);
  } catch {
    return res.status(400).json({ error: "Fichier illisible : envoyez un fichier Excel .xlsx" });
  }
  const ws = wb.worksheets[0];
  if (!ws) return res.status(400).json({ error: "Le fichier ne contient aucune feuille" });

  const parColonne = new Map<number, (typeof COLONNES)[number]["cle"]>();
  ws.getRow(1).eachCell((cell, col) => {
    const cle = colonneDe(texteCellule(cell.value));
    if (cle) parColonne.set(col, cle);
  });
  const manquantes = COLONNES.filter((c) => c.requis && ![...parColonne.values()].includes(c.cle)).map((c) => c.titre);
  if (manquantes.length) {
    return res.status(400).json({ error: `Colonnes manquantes : ${manquantes.join(", ")} (téléchargez le modèle)` });
  }

  const erreurs: { ligne: number; raison: string }[] = [];
  let crees = 0;
  let misAJour = 0;
  const vus = new Set<string>();

  for (let n = 2; n <= ws.rowCount; n++) {
    const row = ws.getRow(n);
    const v: Record<string, string> = {};
    parColonne.forEach((cle, col) => (v[cle] = texteCellule(row.getCell(col).value)));
    if (Object.values(v).every((x) => !x)) continue; // ligne vide

    const code = v.code;
    const prixVente = nombre(v.prixVente ?? "");
    const prixAchat = nombre(v.prixAchat ?? "") ?? 0;
    const colisage = nombre(v.colisage ?? "") ?? 1;
    const tva = nombre(v.tva ?? "") ?? 19;
    const raison = !code
      ? "code manquant"
      : !v.designation
        ? "désignation manquante"
        : prixVente === undefined || !(prixVente >= 0)
          ? "prix de vente invalide"
          : !(prixAchat >= 0)
            ? "prix d'achat invalide"
            : !Number.isInteger(colisage) || colisage < 1
              ? "colisage invalide (nombre entier ≥ 1)"
              : !(tva >= 0 && tva <= 100)
                ? "TVA invalide (0 à 100)"
                : vus.has(code)
                  ? `code ${code} en double dans le fichier`
                  : null;
    if (raison) {
      erreurs.push({ ligne: n, raison });
      continue;
    }
    vus.add(code);

    const donnees = {
      designation: v.designation,
      marque: v.marque || null,
      unit: v.unit || null,
      codeBarre: v.codeBarre || null,
      prixVente: prixVente!,
      prixAchat,
      colisage,
      tva,
      deletedAt: null,
    };
    try {
      const existant = await prisma.article.findUnique({
        where: { societeId_code: { societeId: req.societeId!, code } },
        select: { id: true },
      });
      if (existant) {
        await prisma.article.update({ where: { id: existant.id }, data: donnees });
        misAJour++;
      } else {
        await prisma.article.create({ data: { ...donnees, code, societeId: req.societeId! } });
        crees++;
      }
    } catch (err) {
      console.error(err);
      erreurs.push({ ligne: n, raison: "enregistrement impossible" });
    }
  }

  res.json({ crees, misAJour, erreurs });
});

/* ---------------------------------------------------------------- Fiche article */

articlesRouter.get("/:id", async (req, res) => {
  const article = await prisma.article.findFirst({ where: { id: req.params.id, societeId: req.societeId } });
  if (!article) return res.status(404).json({ error: "Article introuvable" });
  res.json(article);
});

const articleSchema = z.object({
  code: z.string().min(1),
  codeBarre: z.string().optional(),
  designation: z.string().min(1),
  marque: z.string().optional(),
  unit: z.string().optional(),
  img: z.string().optional(),
  prixAchat: z.number().nonnegative(),
  prixVente: z.number().nonnegative(),
  colisage: z.number().int().positive().default(1),
  tva: z.number().min(0).max(100).default(19),
});

articlesRouter.post("/", requireAdmin, async (req, res) => {
  const parsed = articleSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const article = await prisma.article.create({ data: { ...parsed.data, societeId: req.societeId! } });
    res.status(201).json(article);
  } catch (err) {
    if (codeDejaPris(err)) return res.status(409).json({ error: "Ce code article existe déjà dans la société" });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

articlesRouter.put("/:id", requireAdmin, async (req, res) => {
  const parsed = articleSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const maj = await prisma.article.updateMany({ where: { id: req.params.id, societeId: req.societeId }, data: parsed.data });
    if (maj.count === 0) return res.status(404).json({ error: "Article introuvable" });
    res.json(await prisma.article.findUnique({ where: { id: req.params.id } }));
  } catch (err) {
    if (codeDejaPris(err)) return res.status(409).json({ error: "Ce code article existe déjà dans la société" });
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

articlesRouter.delete("/:id", requireAdmin, async (req, res) => {
  await prisma.article.updateMany({ where: { id: req.params.id, societeId: req.societeId }, data: { deletedAt: new Date() } });
  res.status(204).send();
});
