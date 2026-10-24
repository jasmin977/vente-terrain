// Impression des chèques et des traites sur le papier de la banque : seul le texte est imprimé, chacun dans la
// case du papier (une boîte en mm). Le texte s'y centre, rapetisse ou passe à la ligne pour ne jamais en sortir.
// Les cases se règlent une fois par compte bancaire (écran « Réglage du papier »).
import type { ChampGabarit, GabaritEffet, TypeEffet, ValeursEffet } from "../types/effet";
import { montantEffetEnLettres } from "./montantEnLettres";

/** Version du modèle de cases : un réglage plus ancien (positions en points) est ignoré. */
export const VERSION_GABARIT = 2;

/** Image du papier vierge (repère à l'écran et sur l'impression de test, jamais sur la vraie impression). */
export const FOND_TRAITE = "/effets/traite.webp";
export const fondDe = (type: TypeEffet) => (type === "TRAITE" ? FOND_TRAITE : null);

export type CleValeur =
  | "echeance"
  | "lieu"
  | "dateCreation"
  | "ribBanque"
  | "ribAgence"
  | "ribCompte"
  | "ribCle"
  | "montant"
  | "monnaie"
  | "ordre"
  | "lettres"
  | "lettresSuite"
  | "payeur"
  | "banque";

/** Une case imprimée : `valeur` dit quoi y écrire (une même valeur peut s'imprimer dans plusieurs cases). */
export interface DefinitionChamp {
  cle: string;
  valeur: CleValeur;
  libelle: string;
}

// Lettre de change normalisée (176 × 115 mm) : la partie haute reprend échéance, lieu, date, RIB et montant ;
// le corps porte le tireur, le bénéficiaire, le montant en lettres, puis le tiré et sa domiciliation.
export const CHAMPS_TRAITE: DefinitionChamp[] = [
  { cle: "echeance1", valeur: "echeance", libelle: "Échéance (haut)" },
  { cle: "lieu1", valeur: "lieu", libelle: "À (lieu, haut)" },
  { cle: "dateCreation1", valeur: "dateCreation", libelle: "Le (date, haut)" },
  { cle: "rib1Banque", valeur: "ribBanque", libelle: "RIB haut · banque" },
  { cle: "rib1Agence", valeur: "ribAgence", libelle: "RIB haut · agence" },
  { cle: "rib1Compte", valeur: "ribCompte", libelle: "RIB haut · compte" },
  { cle: "rib1Cle", valeur: "ribCle", libelle: "RIB haut · clé" },
  { cle: "montant1", valeur: "montant", libelle: "Montant (haut)" },
  { cle: "tireur", valeur: "ordre", libelle: "Tireur" },
  { cle: "ordre", valeur: "ordre", libelle: "Payer à l'ordre de" },
  { cle: "montant2", valeur: "montant", libelle: "Montant" },
  { cle: "lettres", valeur: "lettres", libelle: "Montant en lettres" },
  { cle: "lieu2", valeur: "lieu", libelle: "Lieu de création" },
  { cle: "dateCreation2", valeur: "dateCreation", libelle: "Date de création" },
  { cle: "echeance2", valeur: "echeance", libelle: "Échéance" },
  { cle: "rib2Banque", valeur: "ribBanque", libelle: "RIB tiré · code étab." },
  { cle: "rib2Agence", valeur: "ribAgence", libelle: "RIB tiré · code agence" },
  { cle: "rib2Compte", valeur: "ribCompte", libelle: "RIB tiré · n° de compte" },
  { cle: "rib2Cle", valeur: "ribCle", libelle: "RIB tiré · clé" },
  { cle: "monnaie", valeur: "monnaie", libelle: "Valeur en" },
  { cle: "payeur", valeur: "payeur", libelle: "Nom et adresse du tiré" },
  { cle: "banque", valeur: "banque", libelle: "Domiciliation" },
];

// Chèque : montant en chiffres, montant en lettres sur deux lignes, bénéficiaire, lieu et date.
export const CHAMPS_CHEQUE: DefinitionChamp[] = [
  { cle: "montant", valeur: "montant", libelle: "Montant en chiffres" },
  { cle: "lettres", valeur: "lettres", libelle: "Montant en lettres (ligne 1)" },
  { cle: "lettresSuite", valeur: "lettresSuite", libelle: "Montant en lettres (ligne 2)" },
  { cle: "ordre", valeur: "ordre", libelle: "À l'ordre de" },
  { cle: "lieu", valeur: "lieu", libelle: "Lieu" },
  { cle: "dateCreation", valeur: "dateCreation", libelle: "Date" },
];

export const champsDe = (type: TypeEffet) => (type === "TRAITE" ? CHAMPS_TRAITE : CHAMPS_CHEQUE);

/** Case : coin haut gauche, largeur et hauteur (mm). */
const b = (x: number, y: number, largeur: number, hauteur: number, extra: Partial<ChampGabarit> = {}): ChampGabarit => ({
  x,
  y,
  largeur,
  hauteur,
  taille: 10,
  ...extra,
});

/** Cases de la lettre de change, relevées sur le papier vierge (scan) ramené à 176 × 115 mm. */
export const GABARIT_TRAITE: GabaritEffet = {
  version: VERSION_GABARIT,
  largeur: 176,
  hauteur: 115,
  papier: "EFFET",
  decalageX: 0,
  decalageY: 0,
  champs: {
    echeance1: b(49.25, 17.75, 30.75, 5.5),
    lieu1: b(85.25, 13.5, 29, 4.5),
    dateCreation1: b(85.25, 18.25, 29, 4.5),
    rib1Banque: b(48.75, 26, 10.5, 6.5),
    rib1Agence: b(59.75, 26, 11.25, 6.5),
    rib1Compte: b(71.25, 26, 43.5, 6.5),
    rib1Cle: b(115.5, 26, 8, 6.5),
    montant1: b(131.25, 26, 40, 6, { taille: 11, gras: true }),
    tireur: b(4, 39.5, 39.75, 8.5, { lignes: 2 }),
    ordre: b(46, 43.25, 83.5, 4.5, { alignement: "gauche" }),
    montant2: b(131.25, 41, 40, 5, { taille: 11, gras: true }),
    lettres: b(3.75, 50.25, 167.5, 4.5, { alignement: "gauche" }),
    lieu2: b(4, 59.5, 26.25, 5.75),
    dateCreation2: b(31, 59.5, 25.5, 5.75),
    echeance2: b(57.75, 59.5, 26.5, 5.75),
    rib2Banque: b(3.75, 70, 6.5, 4.75),
    rib2Agence: b(10.75, 70, 10, 4.75),
    rib2Compte: b(21.5, 70, 46.25, 4.75),
    rib2Cle: b(68, 70, 6.5, 4.75),
    monnaie: b(88.5, 67, 26.25, 4.5),
    payeur: b(77, 75.75, 37.75, 18.25, { lignes: 4 }),
    banque: b(117.5, 70.5, 54.25, 10.25, { lignes: 2 }),
  },
};

/** Chèque : format courant 175 × 80 mm, cases de départ à ajuster sur votre carnet. */
export const GABARIT_CHEQUE: GabaritEffet = {
  version: VERSION_GABARIT,
  largeur: 175,
  hauteur: 80,
  papier: "EFFET",
  decalageX: 0,
  decalageY: 0,
  champs: {
    montant: b(128, 8, 42, 8, { taille: 11, gras: true }),
    lettres: b(38, 18, 132, 6, { alignement: "gauche" }),
    lettresSuite: b(6, 25, 164, 6, { alignement: "gauche" }),
    ordre: b(22, 32, 148, 6, { alignement: "gauche" }),
    lieu: b(105, 41, 32, 6),
    dateCreation: b(140, 41, 30, 6),
  },
};

export const gabaritParDefaut = (type: TypeEffet): GabaritEffet => structuredClone(type === "TRAITE" ? GABARIT_TRAITE : GABARIT_CHEQUE);

/** Réglage enregistré (s'il est du modèle actuel), complété des cases ajoutées depuis. */
export function gabaritDe(type: TypeEffet, enregistre?: GabaritEffet | null): GabaritEffet {
  const base = gabaritParDefaut(type);
  if (!enregistre || enregistre.version !== VERSION_GABARIT) return base;
  const champs = { ...base.champs };
  for (const [cle, ch] of Object.entries(enregistre.champs)) if (cle in champs) champs[cle] = { ...champs[cle], ...ch };
  return { ...base, ...enregistre, champs };
}

// ---------------------------------------------------------------- Mesure et mise en case

const PT_MM = 25.4 / 72;
/** Interligne (en tailles de police). */
export const INTERLIGNE = 1.15;
/** Marge intérieure de chaque case (mm) : le texte ne touche pas les traits. */
export const MARGE = 0.6;

let contexte: CanvasRenderingContext2D | null = null;
function largeurTexte(texte: string, taillePt: number, gras = false, espacement = 0): number {
  contexte ??= typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  let base: number;
  if (contexte) {
    contexte.font = `${gras ? "bold " : ""}${taillePt * (96 / 72)}px Arial`;
    base = contexte.measureText(texte).width * (25.4 / 96);
  } else base = texte.length * taillePt * PT_MM * 0.66;
  return base + espacement * Math.max(0, texte.length - 1);
}

/** Lignes d'un texte coupé aux mots pour tenir dans `largeur` (un mot trop long reste seul sur sa ligne). */
function couperEnLignes(texte: string, largeur: number, taille: number, gras?: boolean, espacement?: number): string[] {
  const lignes: string[] = [];
  let ligne = "";
  for (const mot of texte.split(/\s+/).filter(Boolean)) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (ligne && largeurTexte(essai, taille, gras, espacement) > largeur) {
      lignes.push(ligne);
      ligne = mot;
    } else ligne = essai;
  }
  if (ligne) lignes.push(ligne);
  return lignes;
}

export interface TexteEnCase {
  lignes: string[];
  /** Taille retenue (pt) : la taille du réglage, réduite si le texte ne tient pas. */
  taille: number;
}

/** Met un texte dans sa case : taille du réglage, puis plus petit (jusqu'à 5 pt) tant qu'il dépasse. */
export function mettreEnCase(texte: string, ch: ChampGabarit): TexteEnCase {
  const largeur = Math.max(1, ch.largeur - 2 * MARGE);
  const maxLignes = Math.max(1, ch.lignes ?? 1);
  for (let taille = ch.taille; taille >= 5; taille -= 0.25) {
    const lignes = maxLignes > 1 ? couperEnLignes(texte, largeur, taille, ch.gras, ch.espacement) : [texte];
    const tientEnLargeur = lignes.every((l) => largeurTexte(l, taille, ch.gras, ch.espacement) <= largeur);
    const tientEnHauteur = lignes.length <= maxLignes && lignes.length * taille * PT_MM * INTERLIGNE <= ch.hauteur + 0.01;
    if (tientEnLargeur && tientEnHauteur) return { lignes, taille };
  }
  return { lignes: maxLignes > 1 ? couperEnLignes(texte, largeur, 5, ch.gras, ch.espacement).slice(0, maxLignes) : [texte], taille: 5 };
}

/** Coupe le montant en lettres du chèque : ce qui tient sur la première ligne, et la suite. */
function couperMontant(texte: string, ch: ChampGabarit | undefined): [string, string] {
  if (!ch) return [texte, ""];
  const lignes = couperEnLignes(texte, ch.largeur - 2 * MARGE, ch.taille, ch.gras, ch.espacement);
  return [lignes[0] ?? "", lignes.slice(1).join(" ")];
}

// ---------------------------------------------------------------- Valeurs imprimées

const dateFr = (iso: string) => (iso ? iso.split("-").reverse().join("/") : "");
const montantChiffres = (m: number) => `#${m.toFixed(3)} DT#`;

/** RIB tunisien affiché par blocs : banque (2) · agence (3) · compte (13) · clé (2). */
export function ribLisible(rib: string): string {
  const r = rib.replace(/\D/g, "").slice(0, 20);
  return [r.slice(0, 2), r.slice(2, 5), r.slice(5, 18), r.slice(18, 20)].filter(Boolean).join(" ");
}

export interface Domiciliation {
  banque: string;
  agence?: string | null;
  rib: string;
}

/** Texte de chaque case du gabarit. */
export function textesEffet(type: TypeEffet, gabarit: GabaritEffet, v: ValeursEffet, compte: Domiciliation | null): Record<string, string> {
  const lettresCompletes = v.montant > 0 ? montantEffetEnLettres(v.montant) : "";
  // Chèque : ce qui dépasse la première ligne passe sur la seconde.
  const [ligne1, suite] = type === "CHEQUE" ? couperMontant(lettresCompletes, gabarit.champs.lettres) : [lettresCompletes, ""];
  const rib = (compte?.rib ?? "").replace(/\D/g, "");
  const valeurs: Record<CleValeur, string> = {
    echeance: dateFr(v.echeance),
    lieu: v.lieu,
    dateCreation: dateFr(v.dateCreation),
    ribBanque: rib.slice(0, 2),
    ribAgence: rib.slice(2, 5),
    ribCompte: rib.slice(5, 18),
    ribCle: rib.slice(18, 20),
    montant: v.montant > 0 ? montantChiffres(v.montant) : "",
    monnaie: v.monnaie,
    ordre: v.ordre,
    lettres: ligne1,
    lettresSuite: suite,
    payeur: v.payeur,
    banque: compte ? [compte.banque, compte.agence].filter(Boolean).join(" ") : "",
  };
  const res: Record<string, string> = {};
  for (const d of champsDe(type)) res[d.cle] = valeurs[d.valeur] ?? "";
  return res;
}

// ---------------------------------------------------------------- Impression

const echapper = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
export const ALIGNE = { gauche: ["flex-start", "left"], centre: ["center", "center"], droite: ["flex-end", "right"] } as const;

/**
 * Page à imprimer. `test` : impression sur papier blanc pour vérifier le calage (contour du papier, cadre de chaque
 * case et papier vierge en fond, pâle). `origine` : adresse du site, pour l'image de fond dans la page imprimée.
 */
export function pageEffet(type: TypeEffet, gabarit: GabaritEffet, textes: Record<string, string>, options: { test?: boolean; origine?: string } = {}): string {
  const g = gabarit;
  const page = g.papier === "A4" ? { l: 210, h: 297 } : { l: g.largeur, h: g.hauteur };
  const fond = options.test ? fondDe(type) : null;
  const cases = champsDe(type)
    .map((d) => {
      const ch = g.champs[d.cle];
      const texte = textes[d.cle] ?? "";
      if (!ch || ch.masque || (!texte && !options.test)) return "";
      const { lignes, taille } = mettreEnCase(texte || d.libelle, ch);
      const [flex, align] = ALIGNE[ch.alignement ?? "centre"];
      const style = [
        `left:${ch.x}mm`,
        `top:${ch.y}mm`,
        `width:${ch.largeur}mm`,
        `height:${ch.hauteur}mm`,
        `align-items:${flex}`,
        `text-align:${align}`,
        `font-size:${taille}pt`,
        ch.gras ? "font-weight:bold" : "",
        ch.espacement ? `letter-spacing:${ch.espacement}mm` : "",
        options.test ? "outline:0.2mm dashed #c33" : "",
        options.test && !texte ? "color:#c33" : "",
      ]
        .filter(Boolean)
        .join(";");
      return `<div class="case" style="${style}">${lignes.map((l) => `<span>${echapper(l)}</span>`).join("")}</div>`;
    })
    .join("");
  const imageFond = fond ? `<img class="fond" src="${echapper((options.origine ?? "") + fond)}" alt="">` : "";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${type === "TRAITE" ? "Traite" : "Chèque"}</title><style>
@page { size: ${page.l}mm ${page.h}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; width: ${page.l}mm; height: ${page.h}mm; overflow: hidden; }
body { font-family: Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.effet { position: absolute; left: ${g.decalageX}mm; top: ${g.decalageY}mm; width: ${g.largeur}mm; height: ${g.hauteur}mm;
  ${g.rotation ? "transform: rotate(180deg);" : ""} ${options.test ? "outline: 0.3mm solid #000;" : ""} }
.case { position: absolute; display: flex; flex-direction: column; justify-content: center; padding: 0 ${MARGE}mm; overflow: hidden; line-height: ${INTERLIGNE}; }
.case span { display: block; white-space: nowrap; }
.fond { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0.3; }
</style></head><body><div class="effet">${imageFond}${cases}</div></body></html>`;
}

/** Ouvre la boîte d'impression du navigateur sur la page de l'effet (taille réelle, sans marge). */
export function imprimerPage(html: string): Promise<void> {
  const cadre = document.createElement("iframe");
  cadre.style.cssText = "position:fixed;width:0;height:0;border:0;right:0;bottom:0";
  return new Promise<void>((resolve) => {
    cadre.onload = () => {
      // Laisse le temps au papier de fond (impression de test) de s'afficher.
      setTimeout(() => {
        cadre.contentWindow?.focus();
        cadre.contentWindow?.print();
        setTimeout(() => cadre.remove(), 60_000);
        resolve();
      }, 300);
    };
    cadre.srcdoc = html;
    document.body.appendChild(cadre);
  });
}
