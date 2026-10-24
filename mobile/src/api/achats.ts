import { apiRequest } from "./client";
import type {
  Achat,
  AchatDetail,
  AchatInput,
  Fournisseur,
  FournisseurInput,
  ImpayesFournisseur,
  ReglementFournisseur,
  ReglementInput,
  TypeAchat,
} from "../types/achat";
import type { ModePaiement } from "../types/facture";

// Jour « AAAA-MM-JJ » lu dans le fuseau du téléphone : début et fin de journée exacts.
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const debutJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T00:00:00`).toISOString() : d);
const finJour = (d: string) => (JOUR.test(d) ? new Date(`${d}T23:59:59.999`).toISOString() : d);
// Date d'un document : midi local, pour qu'aucun fuseau ne la fasse changer de jour.
export const dateDocument = (jour: string) => (JOUR.test(jour) ? new Date(`${jour}T12:00:00`).toISOString() : jour);

function qs(params: Record<string, string | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

/* ---------- Fournisseurs ---------- */

export function listFournisseurs(q?: string): Promise<Fournisseur[]> {
  return apiRequest<Fournisseur[]>(`/fournisseurs${qs({ q })}`);
}

export function createFournisseur(input: FournisseurInput): Promise<Fournisseur> {
  return apiRequest<Fournisseur>("/fournisseurs", { method: "POST", body: input });
}

export function updateFournisseur(id: string, input: Partial<FournisseurInput>): Promise<Fournisseur> {
  return apiRequest<Fournisseur>(`/fournisseurs/${id}`, { method: "PUT", body: input });
}

export function deleteFournisseur(id: string): Promise<void> {
  return apiRequest<void>(`/fournisseurs/${id}`, { method: "DELETE" });
}

/* ---------- Achats (BL et factures fournisseurs) ---------- */

export interface AchatFilters {
  type?: TypeAchat;
  fournisseurId?: string;
  dateFrom?: string;
  dateTo?: string;
  statut?: "impaye" | "paye";
}

export function listAchats(f: AchatFilters = {}): Promise<Achat[]> {
  return apiRequest<Achat[]>(
    `/achats${qs({ type: f.type, fournisseurId: f.fournisseurId, statut: f.statut, dateFrom: f.dateFrom && debutJour(f.dateFrom), dateTo: f.dateTo && finJour(f.dateTo) })}`,
  );
}

export function getAchat(id: string): Promise<AchatDetail> {
  return apiRequest<AchatDetail>(`/achats/${id}`);
}

export function createAchat(input: AchatInput): Promise<Achat> {
  return apiRequest<Achat>("/achats", { method: "POST", body: { ...input, date: dateDocument(input.date) } });
}

export function prochainNumeroAchat(type: TypeAchat, annee: number): Promise<{ numero: string }> {
  return apiRequest<{ numero: string }>(`/achats/numero-suivant?type=${type}&annee=${annee}`);
}

export function deleteAchat(id: string): Promise<void> {
  return apiRequest<void>(`/achats/${id}`, { method: "DELETE" });
}

export function transformerBlEnFacture(input: { bonIds: string[]; numero: string; date: string }): Promise<Achat> {
  return apiRequest<Achat>("/achats/transformer", { method: "POST", body: { ...input, date: dateDocument(input.date) } });
}

/* ---------- Règlements fournisseurs ---------- */

export interface ReglementFilters {
  fournisseurId?: string;
  mode?: ModePaiement;
  dateFrom?: string;
  dateTo?: string;
}

export function listReglementsFournisseurs(f: ReglementFilters = {}): Promise<ReglementFournisseur[]> {
  return apiRequest<ReglementFournisseur[]>(
    `/reglements-fournisseurs${qs({ fournisseurId: f.fournisseurId, mode: f.mode, dateFrom: f.dateFrom && debutJour(f.dateFrom), dateTo: f.dateTo && finJour(f.dateTo) })}`,
  );
}

export function listImpayesFournisseurs(type?: TypeAchat): Promise<ImpayesFournisseur[]> {
  return apiRequest<ImpayesFournisseur[]>(`/reglements-fournisseurs/impayes${qs({ type })}`);
}

export function createReglementFournisseur(input: ReglementInput): Promise<ReglementFournisseur> {
  return apiRequest<ReglementFournisseur>("/reglements-fournisseurs", {
    method: "POST",
    body: { ...input, date: dateDocument(input.date), echeance: input.echeance ? dateDocument(input.echeance) : undefined },
  });
}

/** Chèque / traite imprimé : numéro du papier, compte tiré et valeurs imprimées gardés sur le règlement. */
export function enregistrerImpressionReglement(
  id: string,
  input: { reference: string | null; compteBancaireId: string | null; echeance: string | null; impression: Record<string, string | boolean | null> },
): Promise<ReglementFournisseur> {
  return apiRequest<ReglementFournisseur>(`/reglements-fournisseurs/${id}/impression`, { method: "POST", body: input });
}

/** Rattache l'avance (versée sans document) d'un fournisseur à ses BL / factures ; les plus anciennes avances d'abord. */
export function imputerAvance(fournisseurId: string, affectations: { achatId: string; montant: number }[]): Promise<{ impute: number; resteAvance: number }> {
  return apiRequest<{ impute: number; resteAvance: number }>("/reglements-fournisseurs/imputer", { method: "POST", body: { fournisseurId, affectations } });
}

/** Une réception d'un article (ligne d'un BL, d'une facture ou d'un B° Entrée). */
export interface ReceptionArticle {
  id: string;
  quantite: number;
  prixUnitaire: number;
  tauxTva: number;
  dateExpiration: string | null;
  achat: { id: string; type: "BL" | "FACTURE" | "ENTREE"; numero: string; date: string; fournisseurLibre: string | null };
  fournisseur: { id: string; nom: string; ref: number; divers: boolean };
}

/** Fiche article › Fournisseurs : toutes ses réceptions, de la plus récente à la plus ancienne. */
export function getAchatsArticle(articleId: string): Promise<ReceptionArticle[]> {
  return apiRequest<ReceptionArticle[]>(`/achats/article/${articleId}`);
}

export function deleteReglementFournisseur(id: string): Promise<void> {
  return apiRequest<void>(`/reglements-fournisseurs/${id}`, { method: "DELETE" });
}
