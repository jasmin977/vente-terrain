// Montants en toutes lettres : pied des factures, chèques et traites (orthographe traditionnelle :
// « quatre-vingts », « deux cents », « mille » invariable, « et un » pour 21, 31… 71).

const UNITES = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
const DIZAINES = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

/** 0 à 99. */
function deuxChiffres(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  // 70–79 et 90–99 : soixante-dix…, quatre-vingt-dix…
  if (d === 7 || d === 9) return `${DIZAINES[d]}${d === 7 && u === 1 ? " et " : "-"}${UNITES[10 + u]}`;
  if (u === 0) return d === 8 ? "quatre-vingts" : DIZAINES[d];
  if (u === 1 && d !== 8) return `${DIZAINES[d]} et un`;
  return `${DIZAINES[d]}-${UNITES[u]}`;
}

/** 0 à 999 ; `final` : le nombre termine l'expression (« deux cents » mais « deux cent mille »). */
function troisChiffres(n: number, final: boolean): string {
  const c = Math.floor(n / 100);
  const reste = n % 100;
  let texte = "";
  if (c === 1) texte = "cent";
  else if (c > 1) texte = `${UNITES[c]} cent${reste === 0 && final ? "s" : ""}`;
  if (reste) texte += `${texte ? " " : ""}${deuxChiffres(reste)}`;
  // « quatre-vingts » perd son s devant mille / million.
  if (!final && texte.endsWith("quatre-vingts")) texte = texte.slice(0, -1);
  return texte;
}

/** Nombre entier en lettres (jusqu'aux milliards). */
export function nombreEnLettres(n: number): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zéro";
  const parties: string[] = [];
  const milliards = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const milliers = Math.floor((n % 1e6) / 1e3);
  const unites = n % 1e3;
  if (milliards) parties.push(`${troisChiffres(milliards, false)} milliard${milliards > 1 ? "s" : ""}`);
  if (millions) parties.push(`${troisChiffres(millions, false)} million${millions > 1 ? "s" : ""}`);
  if (milliers) parties.push(milliers === 1 ? "mille" : `${troisChiffres(milliers, false)} mille`);
  if (unites) parties.push(troisChiffres(unites, true));
  return parties.join(" ");
}

const majuscule = (texte: string) => `${texte.charAt(0).toUpperCase()}${texte.slice(1)}`;

/** Pied de facture : « Mille deux cent soixante-dix-neuf Dinars et cinq cents Millimes ». */
export function montantEnLettres(montant: number): string {
  const total = Math.round(Math.abs(montant) * 1000);
  const dinars = Math.floor(total / 1000);
  const millimes = total % 1000;
  let texte = `${nombreEnLettres(dinars)} Dinar${dinars > 1 ? "s" : ""}`;
  if (millimes) texte += ` et ${nombreEnLettres(millimes)} Millime${millimes > 1 ? "s" : ""}`;
  return majuscule(texte);
}

/**
 * Chèques et traites : « Cinq cent vingt-trois Dinars et huit cents Millimes ### » (les ### ferment
 * la ligne pour qu'on n'y ajoute rien).
 */
export function montantEffetEnLettres(montant: number): string {
  const total = Math.round(Math.abs(montant) * 1000);
  const dinars = Math.floor(total / 1000);
  const millimes = total % 1000;
  let texte = `${nombreEnLettres(dinars)} Dinar${dinars > 1 ? "s" : ""}`;
  if (millimes) texte += ` et ${nombreEnLettres(millimes)} Millime${millimes > 1 ? "s" : ""}`;
  return `${majuscule(texte)} ###`;
}
