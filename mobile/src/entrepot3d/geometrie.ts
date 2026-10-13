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
export const NB_PORTES = 2;
export const PORTE_LARGEUR = 4;
/** Écart entre les axes de deux portes voisines : elles sont côte à côte au milieu de la façade. */
export const PORTE_PAS = 6;
export const HAUTEUR_MURS = 6;

/** Chambre froide dans le coin du fond à droite (même valeurs que backend/src/lib/disposition.ts). */
export const FRIGO_LARGEUR = 10;
export const FRIGO_PROFONDEUR = 8;
/** Ouverture de la porte de la chambre froide dans sa cloison avant : de début à fin, depuis la cloison gauche (m). */
export const FRIGO_PORTE = [1.5, 3.5] as const;

/** Angle (autour de Y) d'une étagère : 0 face à la façade, 90 vers le mur gauche, 180 vers le fond, 270 vers le mur droit. */
export const angleRack = (rack: { rotation: number }) => -(rack.rotation * Math.PI) / 180;
