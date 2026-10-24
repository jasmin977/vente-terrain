// Montants en dinars (3 décimales, virgule) et petits utilitaires.

export const arrondir = (n: number, d = 3) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** 12,500 */
export const montant = (n: number) =>
  arrondir(n)
    .toFixed(3)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Quantité : entière sans décimales, sinon jusqu'à 3. */
export const quantite = (n: number) => String(arrondir(n)).replace(".", ",");

/** Saisie « 12,5 » ou « 12.5 » → 12.5 (NaN si invalide). */
export const lireNombre = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(/\s/g, "").replace(",", ".")));

export const uuid = () => crypto.randomUUID();

export const heure = (iso: string | Date) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
export const dateHeure = (iso: string | Date) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const jourLocal = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const ttcDepuisHT = (ht: number, tva: number, fodec = 0) => arrondir(ht * (1 + fodec / 100) * (1 + tva / 100), 3);
