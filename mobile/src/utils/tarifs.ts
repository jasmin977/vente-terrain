// Prix de vente : fixé TTC dans le métier (ex. 22,900) ; le HT en découle et est
// gardé avec 6 décimales pour que HT × (1 + TVA) retombe exactement sur ce prix,
// même sur de grosses quantités (60 pièces : 1 374,000 et non 1 374,022).
// FODEC : taxe de 1 % sur le prix HT de certains articles ; la TVA se calcule sur
// HT + FODEC. TTC = HT × (1 + FODEC) × (1 + TVA).
// (Mêmes calculs que le serveur : backend/src/lib/tarifs.ts.)

export const arrondir = (n: number, decimales: number) => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Coefficient HT → TTC. */
const facteur = (tva: number, fodec: number) => (1 + fodec / 100) * (1 + tva / 100);

/** HT (6 décimales) correspondant à un prix TTC. */
export const htDepuisTTC = (ttc: number, tva: number, fodec = 0) => arrondir(ttc / facteur(tva, fodec), 6);

/** TTC (au millime) correspondant à un prix HT. */
export const ttcDepuisHT = (ht: number, tva: number, fodec = 0) => arrondir(ht * facteur(tva, fodec), 3);

/** Prix de vente TTC d'un article (le prix payé par le client, affiché dans les listes). */
export const prixTTC = (article: { prixVente: number | string; tva: number | string; fodec?: number | string | null }) =>
  ttcDepuisHT(Number(article.prixVente), Number(article.tva), Number(article.fodec ?? 0));

/** Marge en % du prix d'achat HT (undefined si le prix d'achat n'est pas renseigné). */
export const margeDepuis = (ht: number, achat: number) => (achat > 0 ? arrondir((ht / achat - 1) * 100, 2) : undefined);

/** HT obtenu en appliquant une marge (% du prix d'achat) ; le TTC est arrondi au millime. */
export const htDepuisMarge = (achat: number, marge: number, tva: number, fodec = 0) =>
  htDepuisTTC(ttcDepuisHT(achat * (1 + marge / 100), tva, fodec), tva, fodec);
