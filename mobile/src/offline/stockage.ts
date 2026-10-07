import { Preferences } from "@capacitor/preferences";
import type { AuthUser } from "../types/auth";

// Données hors ligne du vendeur connecté, rangées par compte : si un autre
// vendeur se connecte sur le même téléphone, il ne voit ni n'envoie jamais les
// actions du précédent.

let session: AuthUser | null = null;

/** Appelé par AuthContext à la connexion / déconnexion. */
export function definirSession(user: AuthUser | null) {
  session = user;
}

export function getSession(): AuthUser | null {
  return session;
}

/** Seul le vendeur travaille hors ligne ; l'admin reste en direct sur le serveur. */
export function modeHorsLigne(): boolean {
  return session?.role === "VENDEUR";
}

const cle = (nom: string) => `hl:${session?.id ?? "anonyme"}:${nom}`;

export async function lire<T>(nom: string, defaut: T): Promise<T> {
  try {
    const { value } = await Preferences.get({ key: cle(nom) });
    return value ? (JSON.parse(value) as T) : defaut;
  } catch {
    return defaut;
  }
}

export async function ecrire<T>(nom: string, valeur: T): Promise<void> {
  await Preferences.set({ key: cle(nom), value: JSON.stringify(valeur) });
}

// Dernier utilisateur connecté : permet d'ouvrir l'app sans réseau.
const CLE_UTILISATEUR = "hl:utilisateur";

export async function memoriserUtilisateur(user: AuthUser | null): Promise<void> {
  if (user) await Preferences.set({ key: CLE_UTILISATEUR, value: JSON.stringify(user) });
  else await Preferences.remove({ key: CLE_UTILISATEUR });
}

export async function utilisateurMemorise(): Promise<AuthUser | null> {
  try {
    const { value } = await Preferences.get({ key: CLE_UTILISATEUR });
    return value ? (JSON.parse(value) as AuthUser) : null;
  } catch {
    return null;
  }
}
