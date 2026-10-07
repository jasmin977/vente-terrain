import { Preferences } from "@capacitor/preferences";
import { ar } from "./ar";

// Traduction de l'app : le texte français EST la clé, le dictionnaire arabe
// fournit la traduction. Une chaîne absente du dictionnaire reste en français
// (jamais d'écran cassé). Variables : t("Bonjour {nom}", { nom }).

export type Lang = "fr" | "ar";

const STORAGE_KEY = "langue";
let current: Lang = "fr";
const listeners = new Set<(l: Lang) => void>();

/** Forme plurielle arabe (une seule chaîne = invariable). */
export type FormesArabes = string | { one?: string; two?: string; few?: string; many?: string; other: string };

const pluralAr = new Intl.PluralRules("ar");

function remplir(texte: string, vars?: Record<string, string | number>) {
  if (!vars) return texte;
  return texte.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Traduit un texte français (avec variables optionnelles). */
export function t(fr: string, vars?: Record<string, string | number>): string {
  if (current === "ar") {
    const trad = ar[fr];
    if (typeof trad === "string") return remplir(trad, vars);
    if (trad) return remplir(trad.other, vars);
  }
  return remplir(fr, vars);
}

/**
 * Texte dépendant d'un nombre : `tn(n, "{n} facture", "{n} factures")`.
 * En arabe, la clé est la forme plurielle française et le dictionnaire donne
 * les formes selon les règles arabes (1, 2, 3-10, 11+…).
 */
export function tn(n: number, singulier: string, pluriel: string, vars?: Record<string, string | number>): string {
  const v = { n, ...vars };
  if (current === "ar") {
    const trad = ar[pluriel] ?? ar[singulier];
    if (typeof trad === "string") return remplir(trad, v);
    if (trad) {
      const cat = pluralAr.select(n) as keyof Exclude<FormesArabes, string>;
      return remplir(trad[cat] ?? trad.other, v);
    }
  }
  return remplir(Math.abs(n) > 1 ? pluriel : singulier, v);
}

export function getLang(): Lang {
  return current;
}

/** Locale Intl pour les dates : chiffres latins (usage tunisien) dans les deux langues. */
export function getLocale(): string {
  return current === "ar" ? "ar-TN-u-nu-latn" : "fr-FR";
}

function appliquerDocument(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

export async function initLang(): Promise<Lang> {
  try {
    const { value } = await Preferences.get({ key: STORAGE_KEY });
    if (value === "ar" || value === "fr") current = value;
  } catch {
    // préférence illisible : français par défaut
  }
  appliquerDocument(current);
  return current;
}

export async function setLang(lang: Lang) {
  current = lang;
  appliquerDocument(lang);
  listeners.forEach((l) => l(lang));
  try {
    await Preferences.set({ key: STORAGE_KEY, value: lang });
  } catch {
    // non persisté : la langue reste active pour la session
  }
}

export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
