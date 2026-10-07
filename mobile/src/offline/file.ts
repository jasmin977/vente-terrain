import type { ClientInput } from "../types/client";
import type { Facture, FactureInput } from "../types/facture";
import type { EncaissementInput } from "../types/credit";
import { ecrire, lire } from "./stockage";

/**
 * Actions du vendeur en attente d'envoi, dans l'ordre où elles ont été faites.
 * Chacune est rejouée telle quelle sur la route REST habituelle, avec l'id
 * généré sur le téléphone : la renvoyer après une coupure ne crée pas de doublon.
 */
export type Action =
  | { type: "client.creer"; client: ClientInput & { id: string } }
  | { type: "client.modifier"; clientId: string; modifs: Partial<ClientInput> }
  | { type: "client.supprimer"; clientId: string }
  | {
      type: "facture.creer";
      facture: FactureInput & { id: string; numero: string; date: string };
      /** Facture complète (lignes, client, vendeur) pour l'affichage et le ticket. */
      locale: Facture;
    }
  | {
      type: "credit.payer";
      paiementId: string;
      factureId: string;
      encaissement: EncaissementInput;
      /** Pour l'affichage hors ligne. */
      clientId: string;
      montant: number;
      numero: string;
    }
  | { type: "credit.avance"; paiementId: string; clientId: string; montant: number; encaissement: EncaissementInput };

export type ActionEnAttente = Action & {
  /** Identifiant de l'action dans la file. */
  cle: string;
  creeLe: string;
  /** Refus du serveur au dernier envoi (doublon, facture déjà payée…). */
  erreur?: string;
};

const NOM = "file";
type Ecouteur = () => void;
const ecouteurs = new Set<Ecouteur>();

let memoire: ActionEnAttente[] | null = null;

export async function lireFile(): Promise<ActionEnAttente[]> {
  if (!memoire) memoire = await lire<ActionEnAttente[]>(NOM, []);
  return memoire;
}

async function enregistrer(file: ActionEnAttente[]) {
  memoire = file;
  await ecrire(NOM, file);
  ecouteurs.forEach((f) => f());
}

export async function ajouter(action: Action): Promise<ActionEnAttente> {
  const entree: ActionEnAttente = { ...action, cle: crypto.randomUUID(), creeLe: new Date().toISOString() };
  await enregistrer([...(await lireFile()), entree]);
  return entree;
}

export async function retirer(cle: string): Promise<void> {
  await enregistrer((await lireFile()).filter((a) => a.cle !== cle));
}

export async function marquerErreur(cle: string, erreur: string | undefined): Promise<void> {
  await enregistrer((await lireFile()).map((a) => (a.cle === cle ? { ...a, erreur } : a)));
}

/** À la déconnexion / changement de compte : la file est relue pour le nouveau compte. */
export function oublierFileEnMemoire() {
  memoire = null;
  ecouteurs.forEach((f) => f());
}

export function surChangementFile(f: Ecouteur): () => void {
  ecouteurs.add(f);
  return () => ecouteurs.delete(f);
}
