// Recherche produit unique pour tous les filtres de l'app : désignation,
// marque, unité, code et code-barres. Insensible à la casse et aux accents ;
// chaque mot saisi doit apparaître (« cire orange » trouve « CIRE-WAX ORANGE »).

interface ArticleCherchable {
  designation: string;
  marque?: string | null;
  unit?: string | null;
  code: string;
  codeBarre?: string | null;
}

const normaliser = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** Chaque mot de la recherche doit apparaître dans le texte (casse et accents ignorés). */
export function texteCorrespond(texte: string, recherche: string): boolean {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return true;
  const t = normaliser(texte);
  return mots.every((m) => t.includes(m));
}

export function articleCorrespond(article: ArticleCherchable, recherche: string): boolean {
  return texteCorrespond(
    [article.designation, article.marque, article.unit, article.code, article.codeBarre].filter(Boolean).join(" "),
    recherche
  );
}

/** Article dont le code-barres (ou à défaut le code) est exactement celui scanné. */
export function articleParCode<T extends ArticleCherchable>(articles: T[], code: string): T | undefined {
  const c = code.trim();
  return articles.find((a) => a.codeBarre?.trim() === c) ?? articles.find((a) => a.code.trim() === c);
}

/** Mots-clés pour les PickerSheet (recherche sur tous les champs produit). */
export const articleMotsCles = (a: ArticleCherchable) =>
  [a.marque, a.unit, a.code, a.codeBarre].filter(Boolean).join(" ");
