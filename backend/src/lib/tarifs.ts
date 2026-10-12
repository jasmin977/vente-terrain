// Calculs de prix de vente. Dans le métier, le prix de vente est fixé TTC (un
// chiffre rond, ex. 22,900) ; l'HT en découle. Le prix HT est donc conservé avec
// 6 décimales : TTC = HT × (1 + TVA) retombe exactement sur le prix affiché, même
// sur de grosses quantités (60 pièces à 22,900 = 1 374,000 ; avec un HT arrondi à
// 3 décimales, 19,244, on obtiendrait 1 374,022).
//
// FODEC : taxe de 1 % sur le prix HT de certains articles ; la TVA se calcule sur
// HT + FODEC. TTC = HT × (1 + FODEC) × (1 + TVA).

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

/** HT obtenu en appliquant une marge (% du prix d'achat) ; le TTC est arrondi au millime. */
export const htDepuisMarge = (achat: number, marge: number, tva: number, fodec = 0) =>
  htDepuisTTC(ttcDepuisHT(achat * (1 + marge / 100), tva, fodec), tva, fodec);

const TAUX_USUELS = [0, 7, 13, 19];

/** Taux de TVA déduit de deux prix de vente HT / TTC (ramené au taux usuel le plus proche). */
export function tauxDepuisPrix(ht: number, ttc: number, fodec = 0): number | undefined {
  if (!(ht > 0) || !(ttc >= 0)) return undefined;
  const taux = (ttc / (ht * (1 + fodec / 100)) - 1) * 100;
  const usuel = TAUX_USUELS.find((t) => Math.abs(t - taux) < 0.5);
  return usuel ?? arrondir(taux, 2);
}

// Codes TVA des fichiers exportés par le logiciel de gestion de la société (« Ctva ») :
// 1 = sans TVA, 2 = 7 %, 4 = 19 %. Un code absent de cette table est signalé : mieux
// vaut une ligne refusée qu'une TVA fausse.
export const TVA_PAR_CODE: Record<string, number> = { "1": 0, "2": 7, "4": 19 };
