import { useEffect, useState } from "react";
import { App } from "@capacitor/app";
import { Network } from "@capacitor/network";
import { ApiError, apiRequest, estErreurReseau } from "../api/client";
import type { Article } from "../types/article";
import type { Client } from "../types/client";
import type { CreditClient } from "../types/credit";
import type { Facture } from "../types/facture";
import { ecrireCache, ecrireDerniereSync, lireDerniereSync, recalerNumero } from "./cache";
import { lireFile, marquerErreur, retirer, surChangementFile, type ActionEnAttente } from "./file";
import { modeHorsLigne } from "./stockage";

const DELAI_ENVOI = 20_000;
const DELAI_LECTURE = 15_000;

export interface EtatSync {
  enLigne: boolean;
  enCours: boolean;
  derniereSync: string | null;
  /** Dernière tentative interrompue faute de réseau. */
  injoignable: boolean;
}

export interface ResultatSync {
  envoyees: number;
  refusees: number;
  injoignable: boolean;
}

let etat: EtatSync = { enLigne: true, enCours: false, derniereSync: null, injoignable: false };
const ecouteursEtat = new Set<() => void>();
const ecouteursDonnees = new Set<() => void>();

function majEtat(partiel: Partial<EtatSync>) {
  etat = { ...etat, ...partiel };
  ecouteursEtat.forEach((f) => f());
}

export const estEnLigne = () => etat.enLigne;

/* ---------------------------------------------------------------- Envoi */

function envoyer(a: ActionEnAttente): Promise<unknown> {
  const opts = { timeoutMs: DELAI_ENVOI };
  switch (a.type) {
    case "client.creer":
      return apiRequest("/clients", { ...opts, method: "POST", body: a.client });
    case "client.modifier":
      return apiRequest(`/clients/${a.clientId}`, { ...opts, method: "PUT", body: a.modifs });
    case "client.supprimer":
      return apiRequest(`/clients/${a.clientId}`, { ...opts, method: "DELETE" });
    case "facture.creer":
      return apiRequest("/factures", { ...opts, method: "POST", body: a.facture });
    case "credit.payer":
      return apiRequest(`/credits/factures/${a.factureId}/payer`, {
        ...opts,
        method: "POST",
        body: { id: a.paiementId, ...a.encaissement },
      });
    case "credit.avance":
      return apiRequest("/credits/avance", {
        ...opts,
        method: "POST",
        body: { id: a.paiementId, clientId: a.clientId, montant: a.montant, ...a.encaissement },
      });
  }
}

/** Recharge les données de référence du vendeur (après l'envoi de ses actions). */
export async function rafraichirDonnees(): Promise<boolean> {
  const lecture = { timeoutMs: DELAI_LECTURE };
  const [articles, clients, credits, factures, numero] = await Promise.allSettled([
    apiRequest<Article[]>("/articles", lecture),
    apiRequest<Client[]>("/clients", lecture),
    apiRequest<CreditClient[]>("/credits", lecture),
    apiRequest<Facture[]>("/factures", lecture),
    apiRequest<{ numero: string }>("/factures/numero-suivant", lecture),
  ]);
  if (articles.status === "fulfilled") await ecrireCache("articles", articles.value);
  if (clients.status === "fulfilled") await ecrireCache("clients", clients.value);
  if (credits.status === "fulfilled") await ecrireCache("credits", credits.value);
  if (factures.status === "fulfilled") await ecrireCache("factures", factures.value);
  if (numero.status === "fulfilled") await recalerNumero(numero.value.numero);
  const ok = [articles, clients, credits, factures].every((r) => r.status === "fulfilled");
  if (ok) {
    const maintenant = new Date().toISOString();
    await ecrireDerniereSync(maintenant);
    majEtat({ derniereSync: maintenant });
  }
  ecouteursDonnees.forEach((f) => f());
  return ok;
}

let enCours: Promise<ResultatSync> | null = null;

/**
 * Envoie les actions en attente dans l'ordre, puis recharge les données.
 * Un refus du serveur (4xx) est noté sur l'action et n'arrête pas les autres ;
 * un manque de réseau arrête l'envoi, repris à la prochaine occasion.
 */
export function synchroniser(): Promise<ResultatSync> {
  if (enCours) return enCours;
  enCours = (async () => {
    const resultat: ResultatSync = { envoyees: 0, refusees: 0, injoignable: false };
    if (!modeHorsLigne()) return resultat;
    majEtat({ enCours: true });
    try {
      for (const action of [...(await lireFile())]) {
        try {
          await envoyer(action);
          await retirer(action.cle);
          resultat.envoyees++;
        } catch (err) {
          if (err instanceof ApiError && err.status === 401) throw err; // session expirée : reconnexion
          if (estErreurReseau(err)) {
            resultat.injoignable = true;
            break;
          }
          await marquerErreur(action.cle, err instanceof Error ? err.message : String(err));
          resultat.refusees++;
        }
      }
      if (!resultat.injoignable) resultat.injoignable = !(await rafraichirDonnees());
    } catch {
      resultat.injoignable = true;
    } finally {
      majEtat({ enCours: false, injoignable: resultat.injoignable });
      enCours = null;
    }
    return resultat;
  })();
  return enCours;
}

/** Synchronisation en arrière-plan, sans attendre ni signaler d'erreur. */
export function declencherSync() {
  if (etat.enLigne) void synchroniser();
}

/* ---------------------------------------------------------------- Automatique */

/**
 * Synchronise au retour du réseau, au retour dans l'app et toutes les deux
 * minutes tant que des actions attendent. À appeler une fois connecté (vendeur).
 */
export function demarrerSyncAuto(): () => void {
  let arrete = false;
  const nettoyages: Array<() => void> = [];
  // Écouteur ajouté après l'arrêt (enregistrement asynchrone) : retiré aussitôt.
  const garder = (h: { remove: () => Promise<void> }) => {
    if (arrete) void h.remove();
    else nettoyages.push(() => void h.remove());
  };

  Network.getStatus()
    .then((s) => majEtat({ enLigne: s.connected }))
    .catch(() => undefined);
  lireDerniereSync().then((d) => majEtat({ derniereSync: d }));

  Network.addListener("networkStatusChange", (s) => {
    majEtat({ enLigne: s.connected });
    if (s.connected) declencherSync();
  }).then(garder);

  App.addListener("appStateChange", ({ isActive }) => {
    if (isActive) declencherSync();
  }).then(garder);

  const minuterie = setInterval(async () => {
    if ((await lireFile()).length > 0) declencherSync();
  }, 120_000);

  declencherSync();

  return () => {
    arrete = true;
    clearInterval(minuterie);
    nettoyages.forEach((f) => f());
  };
}

/* ---------------------------------------------------------------- Hooks */

export function useEtatSync() {
  const [instantane, setInstantane] = useState(etat);
  const [file, setFile] = useState<ActionEnAttente[]>([]);
  useEffect(() => {
    const majFile = () => lireFile().then((f) => setFile([...f]));
    majFile();
    const a = () => setInstantane(etat);
    ecouteursEtat.add(a);
    const b = surChangementFile(majFile);
    return () => {
      ecouteursEtat.delete(a);
      b();
    };
  }, []);
  return { ...instantane, file };
}

/** Rappelle `f` quand de nouvelles données arrivent du serveur (pour recharger un écran). */
export function useApresSync(f: () => void) {
  useEffect(() => {
    ecouteursDonnees.add(f);
    return () => {
      ecouteursDonnees.delete(f);
    };
  }, [f]);
}
