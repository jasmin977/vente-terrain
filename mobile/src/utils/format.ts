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

const deux = (n: number) => String(n).padStart(2, "0");

// jj/mm/aaaa, quelle que soit la langue ou la locale du navigateur.
export function formatDate(value: string | Date): string {
  const d = new Date(value);
  return `${deux(d.getDate())}/${deux(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export function formatDateTime(value: string | Date): string {
  const d = new Date(value);
  return `${formatDate(d)} ${deux(d.getHours())}:${deux(d.getMinutes())}`;
}

// "2026-10-06" ↔ "06/10/2026" (valeur interne ISO, affichage jj/mm/aaaa).
export function isoVersAffichage(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function affichageVersIso(texte: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texte);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (d.getFullYear() !== Number(m[3]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[1])) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
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
