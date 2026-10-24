// Supermarché › Caisse : postes de caisse, caissiers, touches rapides, tickets et clôtures.

export interface PosteCaisse {
  id: string;
  numero: number;
  nom: string;
  actif: boolean;
  /** Le caissier compte le tiroir à la clôture ; sinon clôture à l'aveugle (montant remis saisi par le responsable). */
  comptageCaissier: boolean;
  appaireeLe: string | null;
  derniereSyncLe: string | null;
  /** Code d'appairage en cours de validité (sinon null). */
  codeAppairage: string | null;
  codeExpireLe: string | null;
  sessionOuverte?: { ouverteLe: string; caissier: { nom: string } } | null;
}

export const DROITS_CAISSIER = ["remise", "annulerLigne", "annulerTicket", "retour", "prelevement", "rapportX", "cloture", "tiroir"] as const;
export type DroitCaissier = (typeof DROITS_CAISSIER)[number];
export type DroitsCaissier = Record<DroitCaissier, boolean>;

export interface Caissier {
  id: string;
  nom: string;
  droits: DroitsCaissier;
  actif: boolean;
}

export interface CaissierInput {
  nom: string;
  code?: string;
  droits: DroitsCaissier;
  actif: boolean;
}

export interface ToucheCaisse {
  id: string;
  articleId: string;
  libelle: string | null;
  couleur: string | null;
  ordre: number;
  article: { id: string; designation: string; codeBarre: string | null; img: string | null; prixVente: string; tva: string; fodec: string };
}

export interface FamilleTouches {
  id: string;
  nom: string;
  couleur: string;
  ordre: number;
  touches: ToucheCaisse[];
}

/** Disposition des touches en cours de rangement (brouillon), sans les détails des articles. */
export interface FamilleBrouillon {
  /** Identifiant de la famille publiée, ou provisoire (« nouvelle-… ») pour une famille pas encore synchronisée. */
  id: string;
  nom: string;
  couleur: string;
  touches: { articleId: string; libelle: string | null; couleur: string | null }[];
}

export interface BrouillonTouches {
  familles: FamilleBrouillon[];
  enregistreLe: string;
}

export type ModeReglementCaisse = "ESPECES" | "TPE" | "CHEQUE" | "TICKET_RESTO" | "BON_ACHAT";

export interface TicketResume {
  id: string;
  numero: number;
  date: string;
  type: "VENTE" | "RETOUR";
  montantTTC: string;
  remise: string;
  caisse: { numero: number; nom: string };
  caissier: { nom: string };
  paiements: { mode: ModeReglementCaisse; montant: string }[];
  _count: { lignes: number };
}

export interface TicketDetail extends Omit<TicketResume, "_count"> {
  montantHT: string;
  montantTVA: string;
  rendu: string;
  lignes: {
    id: string;
    quantite: string;
    prixUnitaire: string;
    remise: string;
    montantTTC: string;
    quantiteOfferte: string;
    promotionId: string | null;
    article: { designation: string; codeBarre: string | null };
  }[];
  paiements: { id: string; mode: ModeReglementCaisse; montant: string; reference: string | null }[];
}

export interface TotauxSession {
  nbTickets: number;
  nbRetours: number;
  ventes: number;
  retours: number;
  remises: number;
  parMode: Partial<Record<ModeReglementCaisse, number>>;
  /** Commission des émetteurs de tickets restaurant (retenue sur leur valeur faciale). */
  commissionResto: number;
  prelevements: number;
  apports: number;
  especesNettes: number;
}

export interface SessionCaisse {
  id: string;
  statut: "OUVERTE" | "CLOTUREE";
  ouverteLe: string;
  clotureeLe: string | null;
  numeroZ: number | null;
  fondCaisse: string;
  especesComptees: string | null;
  /** Recette en espèces remise au responsable (hors fond de caisse), saisie depuis le papier du caissier. */
  especesRemises: string | null;
  remiseSaisieLe: string | null;
  remiseSaisieParNom: string | null;
  caisse: { numero: number; nom: string; comptageCaissier: boolean };
  caissier: { nom: string };
  totaux: TotauxSession;
  /** Ventes − retours (le fond de caisse n'en fait pas partie). */
  chiffreAffaires: number;
  /** Espèces que le caissier doit remettre : recette en espèces − prélèvements + apports (fond de caisse exclu). */
  aRemettre: number;
  /** Tiroir attendu : fond + à remettre (comptage à la caisse). */
  especesAttendues: number;
  ecart: number | null;
  mouvements: { id: string; type: "PRELEVEMENT" | "APPORT"; montant: string; motif: string | null; date: string }[];
  retours: { id: string; numero: number; date: string; montantTTC: string; lignes: { quantite: string; montantTTC: string; article: { designation: string } }[] }[];
}

export interface SyntheseCaisse {
  ventes: number;
  retours: number;
  nbTickets: number;
  panierMoyen: number;
  parMode: Partial<Record<ModeReglementCaisse, number>>;
  commissionResto: number;
  topArticles: { articleId: string; designation: string; quantite: number; montant: number }[];
}
