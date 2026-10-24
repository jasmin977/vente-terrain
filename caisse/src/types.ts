// Données de la caisse : configuration reçue du serveur, état local (session, ticket en cours) et file d'envoi.

export const DROITS = ["remise", "annulerLigne", "annulerTicket", "retour", "prelevement", "rapportX", "cloture", "tiroir"] as const;
export type Droit = (typeof DROITS)[number];

export interface Appairage {
  serveur: string;
  cle: string;
  caisse: { id: string; numero: number; nom: string };
  societe: { id: string; nom: string };
}

export interface Caissier {
  id: string;
  nom: string;
  codeHash: string;
  droits: Record<Droit, boolean>;
}

export interface ArticleCaisse {
  id: string;
  code: string | null;
  codeBarre: string | null;
  designation: string;
  marque: string | null;
  img: string | null;
  prixVente: number;
  tva: number;
  fodec: number;
  prixTTC: number;
  colisage: number;
  categorieId: string | null;
  codesBarres: { codeBarre: string; libelle: string | null }[];
  stock: number;
}

export interface Touche {
  id: string;
  articleId: string;
  libelle: string | null;
  couleur: string | null;
}

export interface Famille {
  id: string;
  nom: string;
  couleur: string;
  touches: Touche[];
}

export type ModeLot = "CADEAU" | "UN_PLUS_UN" | "DEUXIEME_MOITIE" | "N_PLUS_UN" | "PRIX_LOT";

export interface PromotionLigne {
  articleId: string;
  prixPromo: number | string | null;
  articleOffertId: string | null;
  quantiteOfferte: number | string | null;
  seuil: number | null;
  tailleLot: number | null;
  prixLot: number | string | null;
}

export interface Promotion {
  id: string;
  type: "PRIX" | "LOT";
  mode: ModeLot | null;
  numero: string;
  libelle: string | null;
  dateDebut: string;
  dateFin: string;
  lignes: PromotionLigne[];
}

export interface ConfigCaisse {
  /** comptageCaissier : le caissier compte le tiroir à la clôture ; sinon clôture à l'aveugle (papier au responsable). */
  caisse: { id: string; numero: number; nom: string; comptageCaissier?: boolean };
  societe: { id: string; nom: string; activite: string | null; adresse: string | null; telephone: string | null; matriculeFiscal: string | null; logo: string | null };
  caissiers: Caissier[];
  familles: Famille[];
  articles: ArticleCaisse[];
  promotions: Promotion[];
  dernierNumeroTicket: number;
  dernierNumeroZ: number;
  sessionOuverte: { id: string; caissierId: string; ouverteLe: string; fondCaisse: string } | null;
  genereLe: string;
}

export type ModeReglement = "ESPECES" | "TPE" | "CHEQUE" | "TICKET_RESTO" | "BON_ACHAT";

/** Ligne saisie par le caissier (prix TTC normal relevé au passage de l'article). */
export interface LigneSaisie {
  uid: string;
  articleId: string;
  designation: string;
  /** Code-barres scanné (peut être un code alternatif), sinon celui de l'article. */
  codeBarre?: string | null;
  quantite: number;
  prixUnitaire: number;
  /** Remise manuelle (TTC) sur la ligne. */
  remise: number;
}

export interface TicketEnCours {
  id: string;
  type: "VENTE" | "RETOUR";
  ouvertLe: string;
  lignes: LigneSaisie[];
  /** Remise manuelle (TTC) sur le ticket entier. */
  remise: number;
  /** Règlements déjà reçus (ex. tickets restaurant) quand le caissier revient ajouter des articles. */
  paiementsRecus?: Paiement[];
}

export interface Paiement {
  mode: ModeReglement;
  montant: number;
  reference?: string | null;
}

export interface LigneTicketEnvoi {
  articleId: string;
  quantite: number;
  prixUnitaire: number;
  remise: number;
  quantiteOfferte: number;
  promotionId: string | null;
}

/** Ticket validé (tel qu'envoyé au serveur), avec de quoi le réimprimer. */
export interface TicketValide {
  id: string;
  sessionId: string;
  caissierId: string;
  numero: number;
  date: string;
  type: "VENTE" | "RETOUR";
  remise: number;
  rendu: number;
  lignes: LigneTicketEnvoi[];
  paiements: Paiement[];
  /** Local seulement : total TTC et désignations (impression, rapports X/Z). */
  total: number;
  designations: string[];
}

export interface SessionLocale {
  id: string;
  caissierId: string;
  ouverteLe: string;
  fondCaisse: number;
  clotureeLe?: string | null;
  numeroZ?: number | null;
  especesComptees?: number | null;
}

export interface MouvementLocal {
  id: string;
  sessionId: string;
  type: "PRELEVEMENT" | "APPORT";
  montant: number;
  motif: string | null;
  date: string;
}

export interface EtatLocal {
  session: SessionLocale | null;
  ticket: TicketEnCours | null;
  attente: TicketEnCours[];
  dernierNumeroTicket: number;
  dernierNumeroZ: number;
  /** Tickets et mouvements de la session ouverte (rapport X, clôture Z, réimpression). */
  tickets: TicketValide[];
  mouvements: MouvementLocal[];
}

export interface FileEnvoi {
  sessions: Record<string, SessionLocale>;
  tickets: TicketValide[];
  mouvements: MouvementLocal[];
}

export interface Reglages {
  imprimante: string | null;
  imprimerAuto: boolean;
}
