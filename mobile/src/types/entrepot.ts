/** Plan du dépôt en 3D (voir backend/src/routes/entrepot.ts). Dimensions en mètres. */

export interface ArticleRange {
  id: string;
  designation: string;
  marque: string | null;
  unit: string | null;
  img: string | null;
  colisage: number;
  /** Stock réel de l'article au dépôt (pas seulement ce qui est dans la case). */
  stock: number;
  /** Seuil du stock bas (stock minimum de l'article, sinon un colis). */
  seuil: number;
  statut: "RUPTURE" | "BAS" | "NOUVEAU" | "OK";
  /** Mise en avant en cours (bleu). */
  etiquette: "NOUVEAU" | "PROMOTION" | null;
  prixTTC: number;
  /** Prix d'achat HT (marge et valeur du stock). */
  prixAchat: number;
  /** Catégorie principale (comparaison des ventes par catégorie). */
  categorie: { id: string; nom: string } | null;
  /** Dernier bon d'entrée de l'article (ISO), null : jamais réapprovisionné. */
  derniereEntree: string | null;
}

/** Une quantité d'un article rangée dans une case (niveau, travée) d'une étagère. */
export interface Emplacement {
  niveau: number;
  travee: number;
  quantite: number;
  article: ArticleRange;
}

export interface Rack {
  id: string;
  nom: string;
  allee: string;
  /** Centre au sol. */
  x: number;
  z: number;
  /** 0 : longueur le long de l'axe x ; 90 : le long de l'axe z. */
  rotation: 0 | 90 | 180 | 270;
  niveaux: number;
  travees: number;
  emplacements: Emplacement[];
}

export interface CamionEntrepot {
  vendeurId: string;
  nom: string;
  code: string;
  nbArticles: number;
  totalPieces: number;
  /** Les plus grosses lignes du stock du camion (au plus 40). */
  stock: { articleId: string; designation: string; quantite: number }[];
}

export interface EntrepotData {
  entrepot: { largeur: number; profondeur: number };
  racks: Rack[];
  camions: CamionEntrepot[];
  resume: { stockArticles: number; stockPieces: number; nonRangeArticles: number; nonRangePieces: number };
  /** Instant où le serveur a calculé le plan (ISO) : indicateur « en direct ». */
  genereLe: string;
}

export type SelectionEntrepot =
  | { type: "rack"; rackId: string }
  | { type: "case"; rackId: string; niveau: number; travee: number }
  | { type: "camion"; vendeurId: string };

export type VueEntrepot = "ensemble" | "dessus" | "interieur" | { allee: string };

export interface RackInput {
  nom: string;
  allee: string;
  x: number;
  z: number;
  rotation: 0 | 90 | 180 | 270;
  niveaux: number;
  travees: number;
}

export interface GenerationInput {
  /** Anciens paramètres (allées au centre) : ignorés, les étagères longent les murs. */
  allees?: number;
  racksParRangee?: number;
  niveaux: number;
  travees: number;
  remplacer: boolean;
}
