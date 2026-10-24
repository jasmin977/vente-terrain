import { Preferences } from "@capacitor/preferences";
import { useEffect, useState } from "react";
import type { Article } from "../types/article";
import type { Categorie } from "../types/categorie";
import { t } from "../i18n";
import { margeDepuis, prixTTC, ttcDepuisHT } from "./tarifs";

/** Critères proposés pour la liste des articles ; « defaut » = ordre du catalogue importé. */
export type CleTri = "defaut" | "alpha" | "prix" | "prixAchat" | "marge" | "expiration" | "marque" | "codeBarre" | "unite" | "quantite" | "categorie" | "sousCategorie";

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
  { value: "prixAchat", label: () => t("Prix d'achat TTC") },
  { value: "marge", label: () => t("Marge") },
  { value: "expiration", label: () => t("Expiration") },
  { value: "categorie", label: () => t("Catégorie") },
  { value: "sousCategorie", label: () => t("Sous-catégorie") },
  { value: "marque", label: () => t("Marque") },
  { value: "codeBarre", label: () => t("Code-barres") },
  { value: "unite", label: () => t("Unité") },
  { value: "quantite", label: () => t("Quantité") },
];

/** Critères d'une liste d'articles du catalogue (sans quantité). */
export const CRITERES_CATALOGUE: CleTri[] = ["defaut", "alpha", "prix", "marque", "codeBarre", "unite"];
/** Critères d'une liste de stock (dépôt, camion). */
export const CRITERES_STOCK: CleTri[] = ["defaut", "alpha", "quantite", "prix", "marque", "codeBarre", "unite"];

/** Prix d'achat TTC d'un article (undefined : prix d'achat inconnu, ou jamais envoyé au vendeur). */
export function prixAchatTTC(a: Pick<Article, "prixAchat" | "tva" | "fodec">): number | undefined {
  return a.prixAchat && a.prixAchat > 0 ? ttcDepuisHT(a.prixAchat, Number(a.tva), Number(a.fodec ?? 0)) : undefined;
}

/** Marge en % du prix d'achat HT (undefined sans prix d'achat). */
export function margeArticle(a: Pick<Article, "prixAchat" | "prixVente">): number | undefined {
  return a.prixAchat && a.prixAchat > 0 ? margeDepuis(Number(a.prixVente), a.prixAchat) : undefined;
}

/** Catégorie et sous-catégorie d'un article : la catégorie la plus précise de l'article, et son parent. */
export function nomsCategorie(cats: Categorie[], id: string | null | undefined): { categorie: string; sous: string } {
  const c = id ? cats.find((x) => x.id === id) : undefined;
  if (!c) return { categorie: "", sous: "" };
  const parent = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
  return parent ? { categorie: parent.nom, sous: c.nom } : { categorie: c.nom, sous: "" };
}

export const libelleTri = (cle: CleTri) => (CRITERES.find((c) => c.value === cle) ?? CRITERES[0]).label();

// « 50 ML » avant « 200 ML », « A2 » avant « A10 ».
const comparer = new Intl.Collator("fr", { numeric: true, sensitivity: "base" }).compare;
/** Ligne triée : l'article et, pour une liste de stock, sa quantité. */
interface Ligne {
  article: Article;
  quantite?: number;
  /** Date d'expiration la plus proche (AAAA-MM-JJ) d'une ligne de stock du dépôt. */
  expiration?: string | null;
}
const parNom = (a: Ligne, b: Ligne) => comparer(a.article.designation, b.article.designation);

/**
 * Comparaison sur le critère choisi, dans le sens demandé. Valeur absente
 * (pas de marque, pas d'unité…) toujours en fin de liste ; à égalité, la
 * désignation départage (A → Z).
 */
function comparateur({ cle, inverse }: TriArticles, categories: Categorie[] = []) {
  const sens = inverse ? -1 : 1;
  // Noms de catégorie calculés une fois par article.
  const noms = new Map<string | null | undefined, { categorie: string; sous: string }>();
  const categorieDe = (a: Article) => {
    const id = a.categorieId;
    let n = noms.get(id);
    if (!n) noms.set(id, (n = nomsCategorie(categories, id)));
    return n;
  };
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
    case "prixAchat":
      return (a: Ligne, b: Ligne) => {
        const x = prixAchatTTC(a.article);
        const y = prixAchatTTC(b.article);
        // Sans prix d'achat : toujours en fin de liste.
        if ((x === undefined) !== (y === undefined)) return x === undefined ? 1 : -1;
        return sens * ((x ?? 0) - (y ?? 0)) || parNom(a, b);
      };
    case "expiration":
      return (a: Ligne, b: Ligne) => {
        const x = a.expiration;
        const y = b.expiration;
        // Sans date : toujours en fin de liste.
        if (!x !== !y) return x ? -1 : 1;
        return sens * ((x ?? "").localeCompare(y ?? "")) || parNom(a, b);
      };
    case "marge":
      return (a: Ligne, b: Ligne) => {
        const x = margeArticle(a.article);
        const y = margeArticle(b.article);
        if ((x === undefined) !== (y === undefined)) return x === undefined ? 1 : -1;
        return sens * ((x ?? 0) - (y ?? 0)) || parNom(a, b);
      };
    case "categorie":
      return texte((a) => categorieDe(a).categorie);
    case "sousCategorie":
      return texte((a) => categorieDe(a).sous);
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

/** Clic sur l'en-tête d'une colonne : premier clic croissant, clic suivant le sens inverse ; autre colonne : croissant. */
export function basculerTri(actuel: TriArticles, cle: CleTri): TriArticles {
  return actuel.cle === cle ? { cle, inverse: !actuel.inverse } : { cle, inverse: false };
}

export function trierArticles<T extends Article>(articles: T[], tri: TriArticles, categories: Categorie[] = []): T[] {
  const cmp = comparateur(tri, categories);
  return [...articles].sort((a, b) => cmp({ article: a }, { article: b }));
}

/** Lignes de stock (dépôt, camion) : article + quantité. */
export function trierStock<T extends { article: Article; quantite: number | string; prochaineExpiration?: string | null }>(lignes: T[], tri: TriArticles): T[] {
  const cmp = comparateur(tri);
  return [...lignes].sort((a, b) =>
    cmp(
      { article: a.article, quantite: Number(a.quantite), expiration: a.prochaineExpiration },
      { article: b.article, quantite: Number(b.quantite), expiration: b.prochaineExpiration },
    )
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
