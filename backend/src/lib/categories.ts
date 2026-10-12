/** Clé de comparaison d'un nom de catégorie : sans accents, sans majuscules, espaces réduits. */
export const cleCategorie = (nom: string) => nom.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
