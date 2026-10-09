import type { Societe } from "./societe";

export type Role = "ADMIN" | "VENDEUR";

export interface AuthUser {
  id: string;
  code: string;
  nom: string;
  role: Role;
  /** Vendeur : sa société (en-tête des tickets, logo d'accueil) ; admin : null. */
  societe?: Societe | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface UserSummary {
  id: string;
  code: string;
  nom: string;
  email?: string | null;
  telephone?: string | null;
  voiture?: string | null;
  matriculeVoiture?: string | null;
  role: Role;
  actif: boolean;
  createdAt?: string;
}

export interface UserInput {
  code: string;
  nom: string;
  email?: string | null;
  telephone?: string | null;
  /** Véhicule, imprimé sur les bons de sortie. */
  voiture?: string | null;
  matriculeVoiture?: string | null;
}
