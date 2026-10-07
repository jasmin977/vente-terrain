import { apiRequest } from "./client";
import type { Client, ClientHistorique, ClientInput } from "../types/client";

export function listClients(q?: string): Promise<Client[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiRequest<Client[]>(`/clients${qs}`);
}

export function getClient(id: string): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`);
}

export function getClientHistorique(id: string): Promise<ClientHistorique> {
  return apiRequest<ClientHistorique>(`/clients/${id}/historique`);
}

export function createClient(input: ClientInput): Promise<Client> {
  return apiRequest<Client>("/clients", { method: "POST", body: input });
}

export function updateClient(id: string, input: Partial<ClientInput>): Promise<Client> {
  return apiRequest<Client>(`/clients/${id}`, { method: "PUT", body: input });
}

export function deleteClient(id: string): Promise<void> {
  return apiRequest<void>(`/clients/${id}`, { method: "DELETE" });
}
