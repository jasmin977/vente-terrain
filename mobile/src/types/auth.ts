export type Role = "ADMIN" | "VENDEUR";

export interface AuthUser {
  id: string;
  code: string;
  nom: string;
  role: Role;
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
  role: Role;
  actif: boolean;
  createdAt?: string;
}

export interface UserInput {
  code: string;
  nom: string;
  email?: string | null;
  telephone?: string | null;
}
