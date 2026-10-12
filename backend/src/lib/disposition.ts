// Calcul de la disposition d'un entrepôt : étagères rangées par allées (couloirs le long de l'axe x),
// deux rangées d'étagères dos à dos de part et d'autre de chaque couloir. Tout est en mètres.

/** Taille d'une case d'étagère : largeur (le long du rack), profondeur, hauteur d'un niveau. */
export const CASE_LARGEUR = 1.3;
export const RACK_PROFONDEUR = 0.9;
export const NIVEAU_HAUTEUR = 0.95;
const COULOIR = 2.8;
const ECART_LATERAL = 1.2;
const MARGE_MUR = 1.5;
// Zone libre devant le bâtiment (portes, quais) : côté z positif.
const ZONE_PORTES = 4;

export interface RackCalcule {
  nom: string;
  allee: string;
  x: number;
  z: number;
  rotation: number;
}

export interface Disposition {
  racks: RackCalcule[];
  largeur: number;
  profondeur: number;
}

const lettre = (i: number) => String.fromCharCode(65 + (i % 26));
const arrondi = (n: number) => Math.round(n * 100) / 100;

export function calculerDisposition(opts: {
  allees: number;
  racksParRangee: number;
  travees: number;
  largeurMin: number;
  profondeurMin: number;
}): Disposition {
  const longueur = opts.travees * CASE_LARGEUR;
  const rangee = opts.racksParRangee * longueur + (opts.racksParRangee - 1) * ECART_LATERAL;
  const pasAllee = 2 * RACK_PROFONDEUR + COULOIR + 1.0;
  const largeur = Math.max(opts.largeurMin, Math.ceil(rangee + 2 * MARGE_MUR));
  const profondeur = Math.max(opts.profondeurMin, Math.ceil(opts.allees * pasAllee + MARGE_MUR + ZONE_PORTES));

  const racks: RackCalcule[] = [];
  const x0 = -rangee / 2 + longueur / 2;
  // Les allées commencent au fond (z négatif) ; la zone des portes reste libre côté z positif.
  const zDepart = -profondeur / 2 + MARGE_MUR + pasAllee / 2;
  for (let a = 0; a < opts.allees; a++) {
    const zc = zDepart + a * pasAllee;
    let n = 1;
    for (const cote of [-1, 1]) {
      for (let k = 0; k < opts.racksParRangee; k++) {
        racks.push({
          nom: `${lettre(a)}${n++}`,
          allee: lettre(a),
          x: arrondi(x0 + k * (longueur + ECART_LATERAL)),
          z: arrondi(zc + cote * (COULOIR / 2 + RACK_PROFONDEUR / 2)),
          rotation: 0,
        });
      }
    }
  }
  return { racks, largeur, profondeur };
}
