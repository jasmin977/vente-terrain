// Dimensions (en mètres) partagées avec le serveur : backend/src/lib/disposition.ts.

/** Largeur d'une case d'étagère (une travée). */
export const CASE_LARGEUR = 1.3;
export const RACK_PROFONDEUR = 0.9;
export const NIVEAU_HAUTEUR = 0.95;
/** Hauteur du premier plancher au-dessus du sol. */
export const SOCLE = 0.15;

export const longueurRack = (travees: number) => travees * CASE_LARGEUR;
export const hauteurRack = (niveaux: number) => SOCLE + niveaux * NIVEAU_HAUTEUR + 0.2;

/** Nombre de portes sur la façade (côté z positif) devant lesquelles se garent les camions. */
export const NB_PORTES = 3;
export const PORTE_LARGEUR = 4;
export const HAUTEUR_MURS = 6;
