import { apiRequest } from "./client";

export type NiveauNotif = "danger" | "warning" | "info";
export type TypeNotif = "RUPTURE" | "STOCK_BAS" | "EXPIRE" | "EXPIRE_BIENTOT" | "CREDIT_RETARD" | "NOUVEL_ARTICLE" | "NOUVEAUX_ARTICLES" | "A_COMPLETER";

export interface Notif {
  id: string;
  type: TypeNotif;
  niveau: NiveauNotif;
  /** ISO : quand l'évènement est apparu. */
  date: string;
  titre: string;
  detail: string;
  params: { nom?: string; q?: number; jours?: number; n?: number; total?: number };
  lien: { ecran: "article" | "peremptions" | "credits" | "articles-a-completer" | "articles"; id?: string };
}

export interface NotificationsReponse {
  genereLe: string;
  evenements: Notif[];
  total: number;
}

/** Alertes et nouveautés du dépôt, jour par jour (admin). */
export function getNotifications(): Promise<NotificationsReponse> {
  return apiRequest<NotificationsReponse>("/notifications");
}
