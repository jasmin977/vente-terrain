import type { Prisma } from "@prisma/client";

// Ordre par défaut de toutes les listes d'articles : celui du catalogue
// (lignes du fichier importé, puis articles ajoutés ensuite), la désignation
// départageant les articles sans position.

export const ORDRE_CATALOGUE: Prisma.ArticleOrderByWithRelationInput[] = [
  { ordre: { sort: "asc", nulls: "last" } },
  { designation: "asc" },
];

/** Même ordre, pour une liste déjà chargée en mémoire. */
export function comparerOrdreCatalogue(
  a: { ordre: number | null; designation: string },
  b: { ordre: number | null; designation: string },
) {
  if ((a.ordre === null) !== (b.ordre === null)) return a.ordre === null ? 1 : -1;
  return (a.ordre ?? 0) - (b.ordre ?? 0) || a.designation.localeCompare(b.designation, "fr");
}
