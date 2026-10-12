import type { Article } from "../types/article";
import type { Categorie } from "../types/categorie";
import { t } from "../i18n";

export const racines = (cats: Categorie[]) => cats.filter((c) => !c.parentId);
export const enfantsDe = (cats: Categorie[], id: string) => cats.filter((c) => c.parentId === id);

/** « Épicerie › Sauces & condiments » (ou « Épicerie » pour une catégorie principale). */
export function chemin(cats: Categorie[], id: string | null | undefined): string {
  const c = cats.find((x) => x.id === id);
  if (!c) return "";
  const parent = c.parentId ? cats.find((x) => x.id === c.parentId) : undefined;
  return parent ? `${parent.nom} › ${c.nom}` : c.nom;
}

/** Une catégorie et ses sous-catégories (filtrer par une catégorie principale inclut toutes ses sous-catégories). */
export function sousArbre(cats: Categorie[], id: string): Set<string> {
  return new Set([id, ...enfantsDe(cats, id).map((c) => c.id)]);
}

/** Articles de la catégorie et de ses sous-catégories, dans la catégorie principale. */
export const totalArticles = (cats: Categorie[], id: string) =>
  cats.filter((c) => c.id === id || c.parentId === id).reduce((s, c) => s + c.nbArticles, 0);

export interface OptionCategorie {
  value: string;
  label: string;
  meta?: string;
  keywords: string;
  niveau?: 0 | 1;
  titre?: boolean;
}

/**
 * Choix pour classer un article : les catégories les plus précises seulement (une catégorie
 * principale qui a des sous-catégories n'est pas un choix : elle sert d'intitulé), dans l'ordre
 * de l'arbre, les sous-catégories en retrait sous leur catégorie.
 */
export function optionsClassement(cats: Categorie[]): OptionCategorie[] {
  const options: OptionCategorie[] = [];
  for (const r of racines(cats)) {
    const enfants = enfantsDe(cats, r.id);
    if (enfants.length === 0) options.push({ value: r.id, label: r.nom, keywords: r.nom });
    else options.push({ value: `titre:${r.id}`, label: r.nom, keywords: r.nom, titre: true });
    for (const e of enfants) options.push({ value: e.id, label: e.nom, keywords: `${r.nom} ${e.nom}`, niveau: 1 });
  }
  return options;
}

/** Choix de filtre : chaque catégorie principale (« toute la catégorie ») puis ses sous-catégories. */
export function optionsFiltre(cats: Categorie[]): OptionCategorie[] {
  const options: OptionCategorie[] = [];
  for (const r of racines(cats)) {
    const enfants = enfantsDe(cats, r.id);
    options.push({
      value: r.id,
      label: r.nom,
      meta: enfants.length ? t("Toute la catégorie · {n} articles", { n: totalArticles(cats, r.id) }) : t("{n} articles", { n: r.nbArticles }),
      keywords: r.nom,
    });
    for (const e of enfants) options.push({ value: e.id, label: e.nom, meta: t("{n} articles", { n: e.nbArticles }), keywords: `${r.nom} ${e.nom}`, niveau: 1 });
  }
  return options;
}

/** Garde les lignes dont l'article est dans la catégorie choisie (ou ses sous-catégories) ; sans filtre, tout. */
export function filtrerParCategorie<T>(lignes: T[], cats: Categorie[], categorieId: string | undefined, article: (l: T) => Pick<Article, "categorieId">): T[] {
  if (!categorieId) return lignes;
  const ids = sousArbre(cats, categorieId);
  return lignes.filter((l) => {
    const c = article(l).categorieId;
    return c ? ids.has(c) : false;
  });
}
