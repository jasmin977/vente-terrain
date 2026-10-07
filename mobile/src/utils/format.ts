import { getLocale, tn } from "../i18n";
export function formatMoney(value: number | string): string {
  return `${Number(value).toFixed(3)} TND`;
}

// Date au format YYYY-MM-DD en heure locale (contrairement à toISOString qui
// bascule sur UTC et peut faire glisser la date d'un jour selon l'heure).
export function toLocalDateString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// Affichage écran uniquement (le ticket imprimé garde formatMoney).
// Montant en groupes de milliers avec espace fine insécable, 3 décimales.
export function formatAmount(value: number | string): string {
  const [int, dec] = Number(value).toFixed(3).split(".");
  const sign = int.startsWith("-") ? "-" : "";
  const digits = sign ? int.slice(1) : int;
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f")}.${dec}`;
}

export function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(getLocale(), { day: "numeric", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | Date): string {
  return new Date(value).toLocaleString(getLocale(), {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString(getLocale(), { hour: "2-digit", minute: "2-digit" });
}

export function formatLongDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long" });
}

// "2026-10-06" → Date locale (évite le décalage UTC de new Date("YYYY-MM-DD")).
export function parseLocalDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Libellé de quantité affiché pour l'unité de vente : la pièce.
// Côté API la notion reste "UNITE".
export const pieces = (n: number) => tn(n, "pièce", "pièces");

// Quantité en pièces exprimée en colis : "4 colis", "4 colis + 2", "2 pièces".
export function formatColis(nbPieces: number, colisage: number): string {
  const n = Math.abs(nbPieces);
  const signe = nbPieces < 0 ? "−" : "";
  if (!colisage || colisage <= 1) return `${signe}${n} ${pieces(n)}`;
  const nbColis = Math.trunc(n / colisage);
  const reste = Math.round((n - nbColis * colisage) * 1000) / 1000;
  if (nbColis === 0) return `${signe}${reste} ${pieces(reste)}`;
  return `${signe}${nbColis} ${tn(nbColis, "colis", "colis")}${reste ? ` + ${reste}` : ""}`;
}

// Ligne « a · b · c » : chaque morceau est isolé (FSI…PDI) pour que les codes,
// villes ou noms en caractères latins ne désordonnent pas une ligne en arabe.
export function joinMeta(parts: Array<string | null | undefined | false>): string {
  return parts
    .filter(Boolean)
    .map((p) => `⁨${p}⁩`)
    .join(" · ");
}
