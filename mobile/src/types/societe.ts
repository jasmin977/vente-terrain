/** Société gérée par l'admin (en-tête des bons et tickets, logo de l'écran d'accueil). */
export interface Societe {
  id: string;
  /** Préfixe des codes vendeurs (RC → RC-V001). */
  code: string;
  nom: string;
  activite?: string | null;
  matriculeFiscal?: string | null;
  adresse?: string | null;
  telephone?: string | null;
  logo?: string | null;
  /** Dépôt (distribution) ou supermarché (avec ses caisses). */
  type?: TypeSociete;
  /** Liste des sociétés (admin) : de quoi savoir si la société est encore vide. */
  _count?: { articles: number; users: number; clients: number };
}

export type TypeSociete = "DEPOT" | "SUPERMARCHE";

export interface SocieteInput {
  nom: string;
  code: string;
  activite?: string;
  matriculeFiscal?: string;
  adresse?: string;
  telephone?: string;
  logo?: string;
  type?: TypeSociete;
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  /** Articles dont le stock du fichier a été versé au dépôt (bon « Stock initial »). */
  stockInitial: number;
  /** Articles dont le stock du fichier a été ignoré : ils ont déjà eu du stock. */
  stockIgnore: number;
  /** Articles dont le stock du fichier est négatif : ignoré. */
  stockNegatif: number;
  /** Fichier « classement seul » : articles classés (sans autre modification). */
  classes?: number;
  /** Catégories et sous-catégories créées par le fichier. */
  categoriesCreees: number;
  /** Articles encore à classer (0 pour une société sans catégorie). */
  sansCategorie: number;
  erreurs: { ligne: number; raison: string }[];
}
