import { Preferences } from "@capacitor/preferences";
import { useEffect, useState } from "react";
import type { Article } from "../types/article";
import { t } from "../i18n";
import { prixTTC } from "./tarifs";

/** Critères proposés pour la liste des articles ; « defaut » = ordre du catalogue importé. */
export type CleTri = "defaut" | "alpha" | "prix" | "marque" | "codeBarre" | "unite" | "quantite";

/** Critère + sens (inverse = décroissant). */
export interface TriArticles {
  cle: CleTri;
  inverse: boolean;
}

export const TRI_DEFAUT: TriArticles = { cle: "defaut", inverse: false };

export const CRITERES: { value: CleTri; label: () => string }[] = [
  { value: "defaut", label: () => t("Par défaut") },
  { value: "alpha", label: () => t("Alphabétique") },
  { value: "prix", label: () => t("Prix") },
  { value: "marque", label: () => t("Marque") },
  { value: "codeBarre", label: () => t("Code-barres") },
  { value: "unite", label: () => t("Unité") },
  { value: "quantite", label: () => t("Quantité") },
];

/** Critères d'une liste d'articles du catalogue (sans quantité). */
export const CRITERES_CATALOGUE: CleTri[] = ["defaut", "alpha", "prix", "marque", "codeBarre", "unite"];
/** Critères d'une liste de stock (dépôt, camion). */
export const CRITERES_STOCK: CleTri[] = ["defaut", "alpha", "quantite", "prix", "marque", "codeBarre", "unite"];

export const libelleTri = (cle: CleTri) => (CRITERES.find((c) => c.value === cle) ?? CRITERES[0]).label();

// « 50 ML » avant « 200 ML », « A2 » avant « A10 ».
const comparer = new Intl.Collator("fr", { numeric: true, sensitivity: "base" }).compare;
/** Ligne triée : l'article et, pour une liste de stock, sa quantité. */
interface Ligne {
  article: Article;
  quantite?: number;
}
const parNom = (a: Ligne, b: Ligne) => comparer(a.article.designation, b.article.designation);

/**
 * Comparaison sur le critère choisi, dans le sens demandé. Valeur absente
 * (pas de marque, pas d'unité…) toujours en fin de liste ; à égalité, la
 * désignation départage (A → Z).
 */
function comparateur({ cle, inverse }: TriArticles) {
  const sens = inverse ? -1 : 1;
  const texte = (val: (a: Article) => string | null | undefined) => (a: Ligne, b: Ligne) => {
    const x = val(a.article)?.trim() ?? "";
    const y = val(b.article)?.trim() ?? "";
    if (!x !== !y) return x ? -1 : 1;
    return sens * comparer(x, y) || parNom(a, b);
  };
  switch (cle) {
    case "defaut":
      return (a: Ligne, b: Ligne) => {
        const x = a.article.ordre;
        const y = b.article.ordre;
        if ((x == null) !== (y == null)) return x == null ? 1 : -1;
        return sens * ((x ?? 0) - (y ?? 0)) || parNom(a, b);
      };
    case "alpha":
      return (a: Ligne, b: Ligne) => sens * parNom(a, b);
    case "prix":
      return (a: Ligne, b: Ligne) => sens * (prixTTC(a.article) - prixTTC(b.article)) || parNom(a, b);
    case "quantite":
      return (a: Ligne, b: Ligne) => sens * (Number(a.quantite ?? 0) - Number(b.quantite ?? 0)) || parNom(a, b);
    case "marque":
      return texte((a) => a.marque);
    case "codeBarre":
      return texte((a) => a.codeBarre);
    case "unite":
      return texte((a) => a.unit);
  }
}

/** Ordre par défaut (catalogue) entre deux articles : lignes des bons A4… */
export function comparerCatalogue(a: Article, b: Article) {
  return comparateur(TRI_DEFAUT)({ article: a }, { article: b });
}

export function trierArticles<T extends Article>(articles: T[], tri: TriArticles): T[] {
  const cmp = comparateur(tri);
  return [...articles].sort((a, b) => cmp({ article: a }, { article: b }));
}

/** Lignes de stock (dépôt, camion) : article + quantité. */
export function trierStock<T extends { article: Article; quantite: number | string }>(lignes: T[], tri: TriArticles): T[] {
  const cmp = comparateur(tri);
  return [...lignes].sort((a, b) =>
    cmp({ article: a.article, quantite: Number(a.quantite) }, { article: b.article, quantite: Number(b.quantite) })
  );
}

/**
 * Tri choisi pour une liste, gardé sur le téléphone d'une ouverture à l'autre
 * (« prix:desc »). Chaque liste a le sien (articles, dépôt, camion).
 */
export function useTriArticles(liste: "articles" | "depot" | "camion" = "articles") {
  const cle = liste === "articles" ? "tri-articles" : `tri-${liste}`;
  const [tri, setTri] = useState<TriArticles>(TRI_DEFAUT);
  useEffect(() => {
    Preferences.get({ key: cle }).then(({ value }) => {
      const [cle, sens] = (value ?? "").split(":");
      if (CRITERES.some((c) => c.value === cle)) setTri({ cle: cle as CleTri, inverse: sens === "desc" });
    });
  }, [cle]);
  const changer = (v: TriArticles) => {
    setTri(v);
    void Preferences.set({ key: cle, value: `${v.cle}:${v.inverse ? "desc" : "asc"}` });
  };
  return [tri, changer] as const;
}
