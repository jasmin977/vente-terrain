import { apiRequest } from "./client";
import type { CreditClient, EncaissementInput, SituationCreditClient } from "../types/credit";

/** Clients ayant une dette, avec leurs factures impayées (plus anciennes d'abord). */
export function listCredits(): Promise<CreditClient[]> {
  return apiRequest<CreditClient[]>("/credits");
}

export function getCreditClient(clientId: string): Promise<SituationCreditClient> {
  return apiRequest<SituationCreditClient>(`/credits/clients/${clientId}`);
}

/** Encaisse le reste à payer d'une facture à crédit. */
export function payerFacture(factureId: string, input: EncaissementInput) {
  return apiRequest(`/credits/factures/${factureId}/payer`, { method: "POST", body: input });
}

/** Avance sur le compte du client, imputée aux factures les plus anciennes. */
export function ajouterAvance(clientId: string, montant: number, input: EncaissementInput) {
  return apiRequest("/credits/avance", { method: "POST", body: { clientId, montant, ...input } });
}

/** Annule un encaissement saisi par erreur (admin). */
export function annulerPaiement(paiementId: string) {
  return apiRequest<void>(`/credits/paiements/${paiementId}`, { method: "DELETE" });
}
