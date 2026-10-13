// Calcul de la disposition d'un entrepôt : les étagères longent les murs du fond et des deux côtés ; la façade
// (les deux portes, côte à côte) reste libre, de même que le centre. Tout est en mètres.
//
// Dans le coin du fond à droite se trouve la chambre froide (« Frigo », 10 m × 8 m) : cloisonnée, avec ses
// propres étagères, pour les produits qui demandent du froid.
//
// Repère : x vers la droite, z vers la façade (côté des portes, z positif). Une étagère de rotation 0 a sa
// face avant tournée vers +z ; 90 vers -x, 180 vers -z, 270 vers +x. Contre un mur, la face avant regarde donc
// le centre : fond = 0, mur droit = 90, mur gauche = 270.

/** Taille d'une case d'étagère : largeur (le long du rack), profondeur, hauteur d'un niveau. */
export const CASE_LARGEUR = 1.3;
export const RACK_PROFONDEUR = 0.9;
export const NIVEAU_HAUTEUR = 0.95;
/** Distance entre l'axe d'un mur et la face arrière d'une étagère. */
const DEGAGEMENT_MUR = 0.6;
/** Espace laissé entre deux étagères voisines d'un même mur. */
const ECART = 0.3;
/**
 * Le dépôt est un rectangle en hauteur : plus profond que large. Dimensions par défaut (de quoi loger
 * plusieurs centaines de cases) et minimales ; un bâtiment déjà en hauteur garde ses dimensions s'il est plus grand.
 */
const LARGEUR_DEFAUT = 26;
const PROFONDEUR_DEFAUT = 44;
const LARGEUR_MIN = 24;
const PROFONDEUR_MIN = 40;
/** Chambre froide dans le coin du fond à droite (partagée avec mobile/src/entrepot3d/geometrie.ts). */
export const FRIGO_LARGEUR = 10;
export const FRIGO_PROFONDEUR = 8;
/** Un tronçon de mur n'accueille une étagère « courte » que si elle fait au moins ce nombre de cases. */
const TRAVEES_MIN = 2;

export interface RackCalcule {
  nom: string;
  allee: string;
  x: number;
  z: number;
  rotation: number;
  travees: number;
}

export interface Disposition {
  racks: RackCalcule[];
  largeur: number;
  profondeur: number;
}

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Découpe un tronçon [debut, fin] (m) en étagères : des pleines de `travees` cases, puis une plus courte pour le reste. */
function remplir(debut: number, fin: number, travees: number): { centre: number; travees: number }[] {
  const lr = (n: number) => n * CASE_LARGEUR;
  const tailles: number[] = [];
  let reste = fin - debut;
  while (reste >= lr(travees) - 1e-6) {
    tailles.push(travees);
    reste -= lr(travees) + ECART;
  }
  const courtes = Math.min(travees - 1, Math.floor(Math.max(0, reste) / CASE_LARGEUR + 1e-9));
  if (courtes >= TRAVEES_MIN && reste >= lr(courtes) - 1e-6) tailles.push(courtes);
  if (tailles.length === 0) return [];
  const total = tailles.reduce((a, n) => a + lr(n), 0) + (tailles.length - 1) * ECART;
  let x = debut + (fin - debut - total) / 2;
  return tailles.map((n) => {
    const centre = x + lr(n) / 2;
    x += lr(n) + ECART;
    return { centre, travees: n };
  });
}

export function calculerDisposition(opts: { travees: number; largeurMin: number; profondeurMin: number }): Disposition {
  const enHauteur = opts.profondeurMin > opts.largeurMin;
  const L = enHauteur ? Math.max(opts.largeurMin, LARGEUR_MIN) : LARGEUR_DEFAUT;
  const P = enHauteur ? Math.max(opts.profondeurMin, PROFONDEUR_MIN) : PROFONDEUR_DEFAUT;
  const demi = RACK_PROFONDEUR / 2;
  const bord = DEGAGEMENT_MUR + demi; // distance du mur à l'axe d'une étagère
  const profondeurRangee = DEGAGEMENT_MUR + RACK_PROFONDEUR + ECART; // le mur perpendiculaire est dégagé au-delà

  const racks: RackCalcule[] = [];
  const ajouter = (allee: string, prefixe: string, rotation: number, tronc: { centre: number; travees: number }[], pose: (c: number) => { x: number; z: number }) => {
    tronc.forEach((t, k) => {
      const { x, z } = pose(t.centre);
      racks.push({ nom: `${prefixe}${k + 1}`, allee, x: arrondi(x), z: arrondi(z), rotation, travees: t.travees });
    });
  };

  const cloisonX = L / 2 - FRIGO_LARGEUR; // cloison gauche de la chambre froide
  const cloisonZ = -P / 2 + FRIGO_PROFONDEUR; // cloison avant de la chambre froide

  // Fond (z négatif) : jusqu'à la chambre froide.
  ajouter("Fond", "F", 0, remplir(-L / 2 + DEGAGEMENT_MUR, cloisonX - 0.4, opts.travees), (c) => ({ x: c, z: -P / 2 + bord }));

  // Murs gauche et droit : entre la rangée du fond et la façade (le mur droit commence après la chambre froide).
  const debutLateral = -P / 2 + profondeurRangee;
  const finLateral = P / 2 - DEGAGEMENT_MUR - ECART; // la façade n'a pas d'étagères : les murs latéraux vont jusqu'aux portes
  ajouter("Droite", "D", 90, remplir(cloisonZ + 0.4, finLateral, opts.travees), (c) => ({ x: L / 2 - bord, z: c }));
  ajouter("Gauche", "G", 270, remplir(debutLateral, finLateral, opts.travees), (c) => ({ x: -L / 2 + bord, z: c }));

  // Chambre froide : étagères contre son fond, son mur droit et sa cloison (faces tournées vers l'intérieur).
  const frigo: { centre: number; travees: number }[][] = [
    remplir(cloisonX + 0.4 + RACK_PROFONDEUR + ECART, L / 2 - DEGAGEMENT_MUR, opts.travees),
    remplir(debutLateral, cloisonZ - 0.4 - RACK_PROFONDEUR, opts.travees),
    remplir(debutLateral, cloisonZ - 0.4 - RACK_PROFONDEUR, opts.travees),
  ];
  const nomsFrigo: RackCalcule[] = [];
  const posees: [number, { centre: number; travees: number }[], (c: number) => { x: number; z: number }][] = [
    [0, frigo[0], (c) => ({ x: c, z: -P / 2 + bord })],
    [90, frigo[1], (c) => ({ x: L / 2 - bord, z: c })],
    [270, frigo[2], (c) => ({ x: cloisonX + 0.4 + demi, z: c })],
  ];
  for (const [rotation, tronc, pose] of posees) {
    tronc.forEach((t) => {
      const { x, z } = pose(t.centre);
      nomsFrigo.push({ nom: `K${nomsFrigo.length + 1}`, allee: "Frigo", x: arrondi(x), z: arrondi(z), rotation, travees: t.travees });
    });
  }
  racks.push(...nomsFrigo);

  return { racks, largeur: L, profondeur: P };
}
