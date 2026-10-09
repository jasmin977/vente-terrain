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
  /** Liste des sociétés (admin) : de quoi savoir si la société est encore vide. */
  _count?: { articles: number; users: number; clients: number };
}

export interface SocieteInput {
  nom: string;
  code: string;
  activite?: string;
  matriculeFiscal?: string;
  adresse?: string;
  telephone?: string;
  logo?: string;
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; raison: string }[];
}
