import { Preferences } from "@capacitor/preferences";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

/** Adresse du serveur sans /api (ex. https://vente-terrain.vercel.app) : sert les photos /uploads/…. */
export const SERVEUR_URL = API_URL.replace(/\/api\/?$/, "");
const TOKEN_KEY = "auth_token";

let cachedToken: string | null | undefined;

// Société courante (admin) : envoyée à chaque requête, le serveur filtre dessus.
// Pour un vendeur, le serveur utilise toujours sa propre société.
let societeRequete: string | null = null;
export function definirSocieteRequete(id: string | null) {
  societeRequete = id;
}

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  const { value } = await Preferences.get({ key: TOKEN_KEY });
  cachedToken = value ?? null;
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
  } else {
    await Preferences.remove({ key: TOKEN_KEY });
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  /** Abandonne la requête après ce délai (réseau faible) : erreur réseau. */
  timeoutMs?: number;
}

/**
 * Serveur injoignable (pas de réseau, délai dépassé) ou en panne (5xx), par
 * opposition à un refus du serveur (4xx) qu'il ne sert à rien de rejouer tel quel.
 */
export function estErreurReseau(err: unknown): boolean {
  if (err instanceof ApiError) return err.status >= 500;
  return true;
}

async function entetes(auth = true): Promise<Record<string, string>> {
  const h: Record<string, string> = {};
  if (auth) {
    const token = await getToken();
    if (token) h.Authorization = `Bearer ${token}`;
  }
  if (societeRequete) h["X-Societe-Id"] = societeRequete;
  return h;
}

/** Requête authentifiée dont on veut la réponse brute (fichier à télécharger). */
export async function requeteBrute(path: string): Promise<Response> {
  const res = await fetch(`${API_URL}${path}`, { headers: await entetes() });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      message = (await res.json())?.error || message;
    } catch {
      // corps non-JSON
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs } = options;

  const headers: Record<string, string> = { "Content-Type": "application/json", ...(await entetes(auth)) };

  const controller = timeoutMs ? new AbortController() : undefined;
  const minuterie = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
  } finally {
    clearTimeout(minuterie);
  }

  if (res.status === 401 && auth) {
    await setToken(null);
    onUnauthorized?.();
  }

  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      message = data?.error?.formErrors?.join(", ") || data?.error || message;
    } catch {
      // corps de réponse non-JSON, on garde le message par défaut
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}
