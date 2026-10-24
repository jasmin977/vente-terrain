import { apiRequest } from "./client";
import type { BrouillonTouches, Caissier, CaissierInput, FamilleBrouillon, FamilleTouches, PosteCaisse, SessionCaisse, SyntheseCaisse, TicketDetail, TicketResume } from "../types/caisse";

const B = "/caisse-admin";
const periode = (du: string, au: string, extra: Record<string, string | undefined> = {}) => {
  const p = new URLSearchParams({ du, au });
  for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
  return p.toString();
};

// ---- Postes de caisse
export const listPostes = () => apiRequest<PosteCaisse[]>(`${B}/caisses`);
export const creerPoste = (body: { nom: string; numero?: number }) => apiRequest<PosteCaisse>(`${B}/caisses`, { method: "POST", body });
export const modifierPoste = (id: string, body: { nom?: string; numero?: number; actif?: boolean; comptageCaissier?: boolean }) => apiRequest<PosteCaisse>(`${B}/caisses/${id}`, { method: "PUT", body });
export const supprimerPoste = (id: string) => apiRequest<void>(`${B}/caisses/${id}`, { method: "DELETE" });
/** Nouveau code d'appairage (6 chiffres, 15 minutes). */
export const codeAppairage = (id: string) => apiRequest<PosteCaisse>(`${B}/caisses/${id}/appairage`, { method: "POST" });
export const dissocierPoste = (id: string) => apiRequest<PosteCaisse>(`${B}/caisses/${id}/dissocier`, { method: "POST" });

// ---- Paramètres (commission des tickets restaurant, %)
export const getParametres = () => apiRequest<{ commissionTicketResto: number }>(`${B}/parametres`);
export const enregistrerParametres = (body: { commissionTicketResto: number }) => apiRequest<{ commissionTicketResto: number }>(`${B}/parametres`, { method: "PUT", body });

// ---- Caissiers
export const listCaissiers = () => apiRequest<Caissier[]>(`${B}/caissiers`);
export const creerCaissier = (body: CaissierInput) => apiRequest<Caissier>(`${B}/caissiers`, { method: "POST", body });
export const modifierCaissier = (id: string, body: Partial<CaissierInput>) => apiRequest<Caissier>(`${B}/caissiers/${id}`, { method: "PUT", body });
export const supprimerCaissier = (id: string) => apiRequest<void>(`${B}/caissiers/${id}`, { method: "DELETE" });

// ---- Touches rapides : brouillon (« Enregistrer ») puis publication vers les caisses (« Synchroniser »)
export const getTouches = () => apiRequest<{ publie: FamilleTouches[]; brouillon: BrouillonTouches | null }>(`${B}/touches`);
export const enregistrerBrouillonTouches = (familles: FamilleBrouillon[]) => apiRequest<BrouillonTouches>(`${B}/touches/brouillon`, { method: "PUT", body: { familles } });
export const abandonnerBrouillonTouches = () => apiRequest<void>(`${B}/touches/brouillon`, { method: "DELETE" });
export const publierTouches = (familles: FamilleBrouillon[]) => apiRequest<{ publie: FamilleTouches[] }>(`${B}/touches/publier`, { method: "POST", body: { familles } });

// ---- Tickets, clôtures, synthèse
export const listTickets = (du: string, au: string, caisseId?: string) => apiRequest<TicketResume[]>(`${B}/tickets?${periode(du, au, { caisseId })}`);
export const listTicketsSession = (sessionId: string) => apiRequest<TicketResume[]>(`${B}/tickets?sessionId=${sessionId}`);
export const getTicket = (id: string) => apiRequest<TicketDetail>(`${B}/tickets/${id}`);
export const listSessions = (du: string, au: string) => apiRequest<SessionCaisse[]>(`${B}/sessions?${periode(du, au)}`);
/** Recette remise par le caissier (papier), hors fond de caisse ; null efface la saisie. */
export const saisirRemise = (sessionId: string, montant: number | null) => apiRequest<void>(`${B}/sessions/${sessionId}/remise`, { method: "PUT", body: { montant } });
export const getSynthese = (du: string, au: string) => apiRequest<SyntheseCaisse>(`${B}/synthese?${periode(du, au)}`);
