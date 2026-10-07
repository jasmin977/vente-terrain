import { apiRequest } from "./client";
import type { AuthUser, LoginResponse, UserInput, UserSummary } from "../types/auth";

export function login(code: string, password: string): Promise<LoginResponse> {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: { code, password }, auth: false });
}

export function me(): Promise<AuthUser> {
  return apiRequest<AuthUser>("/auth/me");
}

export function listUsers(): Promise<UserSummary[]> {
  return apiRequest<UserSummary[]>("/auth/users");
}

// ---- Gestion des comptes vendeurs (admin)

export function getUser(id: string): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/auth/users/${id}`);
}

export function createVendeur(input: UserInput & { password: string }): Promise<UserSummary> {
  return apiRequest<UserSummary>("/auth/users", { method: "POST", body: { ...input, role: "VENDEUR" } });
}

export function updateUser(id: string, input: Partial<UserInput> & { actif?: boolean }): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/auth/users/${id}`, { method: "PUT", body: input });
}

/** Définit un nouveau mot de passe ; le vendeur est déconnecté de ses appareils. */
export function setUserPassword(id: string, password: string) {
  return apiRequest<void>(`/auth/users/${id}/password`, { method: "POST", body: { password } });
}
