// Lecture d'une date d'expiration dans le texte reconnu sur un emballage (OCR) : formats courants
// des produits vendus en Tunisie (31/12/2026, 31.12.26, 12/2026, EXP 31 DEC 2026, 2026-12-31…).

const MOIS: Record<string, number> = {
  JAN: 1, JANV: 1, JANUARY: 1, JANVIER: 1,
  FEB: 2, FEV: 2, FEVR: 2, FEBRUARY: 2, FEVRIER: 2,
  MAR: 3, MARS: 3, MARCH: 3,
  APR: 4, AVR: 4, AVRIL: 4, APRIL: 4,
  MAY: 5, MAI: 5,
  JUN: 6, JUIN: 6, JUNE: 6,
  JUL: 7, JUIL: 7, JUILLET: 7, JULY: 7,
  AUG: 8, AOU: 8, AOUT: 8, AUGUST: 8,
  SEP: 9, SEPT: 9, SEPTEMBRE: 9, SEPTEMBER: 9,
  OCT: 10, OCTOBRE: 10, OCTOBER: 10,
  NOV: 11, NOVEMBRE: 11, NOVEMBER: 11,
  DEC: 12, DECEMBRE: 12, DECEMBER: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");
const dernierJour = (annee: number, mois: number) => new Date(Date.UTC(annee, mois, 0)).getUTCDate();
const anneeComplete = (a: number) => (a < 100 ? 2000 + a : a);

function iso(annee: number, mois: number, jour: number): string | null {
  if (mois < 1 || mois > 12 || jour < 1 || jour > dernierJour(annee, mois)) return null;
  return `${annee}-${pad(mois)}-${pad(jour)}`;
}

/**
 * Dates trouvées dans un texte, au format AAAA-MM-JJ. Une date « mois/année » vaut le dernier jour
 * du mois (un produit « EXP 10/2026 » est bon jusqu'à la fin d'octobre).
 */
export function datesDuTexte(texte: string): string[] {
  const t = texte
    .toUpperCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[,;:]/g, " ");
  const trouvees: string[] = [];
  const ajouter = (d: string | null) => d && trouvees.push(d);

  // 2026-12-31
  for (const m of t.matchAll(/\b(20\d{2})[./\- ](\d{1,2})[./\- ](\d{1,2})\b/g)) ajouter(iso(+m[1], +m[2], +m[3]));
  // 31/12/2026, 31.12.26, 31-12-2026
  for (const m of t.matchAll(/\b(\d{1,2})[./\- ](\d{1,2})[./\- ](\d{4}|\d{2})\b/g)) ajouter(iso(anneeComplete(+m[3]), +m[2], +m[1]));
  // 31 DEC 2026, 31DEC26
  for (const m of t.matchAll(/\b(\d{1,2})\s?([A-Z]{3,9})\.?\s?(\d{4}|\d{2})\b/g)) {
    const mois = MOIS[m[2]];
    if (mois) ajouter(iso(anneeComplete(+m[3]), mois, +m[1]));
  }
  // DEC 2026, DEC 26
  for (const m of t.matchAll(/\b([A-Z]{3,9})\.?\s?(\d{4}|\d{2})\b/g)) {
    const mois = MOIS[m[1]];
    if (mois) ajouter(iso(anneeComplete(+m[2]), mois, dernierJour(anneeComplete(+m[2]), mois)));
  }
  // 12/2026, 12.26 (mois/année, sans jour devant)
  for (const m of t.matchAll(/(?<![\d./-])(\d{1,2})[./-](\d{4}|\d{2})\b(?![./-]\d)/g)) {
    const annee = anneeComplete(+m[2]);
    if (+m[1] >= 1 && +m[1] <= 12) ajouter(iso(annee, +m[1], dernierJour(annee, +m[1])));
  }
  return [...new Set(trouvees)];
}

/**
 * La date d'expiration d'un emballage : l'emballage porte souvent aussi la date de fabrication,
 * l'expiration est la plus lointaine des dates plausibles (pas passée depuis plus d'un an, pas à plus de 10 ans).
 */
export function dateExpirationDuTexte(texte: string, aujourdhui = new Date()): string | null {
  const base = Date.UTC(aujourdhui.getFullYear(), aujourdhui.getMonth(), aujourdhui.getDate());
  const plausibles = datesDuTexte(texte).filter((d) => {
    const ecart = (Date.parse(`${d}T00:00:00Z`) - base) / 86_400_000;
    return ecart >= -365 && ecart <= 3650;
  });
  return plausibles.sort().at(-1) ?? null;
}
