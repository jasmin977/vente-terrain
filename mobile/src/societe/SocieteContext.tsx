import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Preferences } from "@capacitor/preferences";
import { ApiError, definirSocieteRequete } from "../api/client";
import { getSociete } from "../api/societes";
import { useAuth } from "../auth/AuthContext";
import type { Societe } from "../types/societe";
import { definirSocieteImprimee } from "../utils/societe";

const DUREE_ACCUEIL = 1400; // logo de la société à l'ouverture

interface SocieteContextValue {
  /** Société ouverte ; null tant que l'admin n'en a pas choisi. */
  societe: Societe | null;
  /** Écran d'accueil (logo) en cours. */
  accueil: boolean;
  /** Change à chaque ouverture de société : les écrans repartent de zéro. */
  generation: number;
  /** Admin : ouvrir une société. */
  ouvrir: (societe: Societe) => Promise<void>;
  /** Admin : revenir au choix de la société (la précédente reste proposée). */
  changer: () => void;
  /** Dernière société ouverte avant « changer » (bouton Annuler du choix). */
  precedente: Societe | null;
  /** Met à jour la société ouverte (après modification de sa fiche). */
  actualiser: (societe: Societe) => void;
}

const SocieteContext = createContext<SocieteContextValue | null>(null);
const cle = (userId: string) => `societe-admin:${userId}`;

export function SocieteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [societe, setSociete] = useState<Societe | null>(null);
  const [precedente, setPrecedente] = useState<Societe | null>(null);
  const [accueil, setAccueil] = useState(false);
  const [generation, setGeneration] = useState(0);
  const minuterie = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const appliquer = useCallback((s: Societe | null, avecAccueil: boolean) => {
    setSociete(s);
    definirSocieteImprimee(s);
    if (s && avecAccueil) {
      setGeneration((g) => g + 1);
      setAccueil(true);
      clearTimeout(minuterie.current);
      minuterie.current = setTimeout(() => setAccueil(false), DUREE_ACCUEIL);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      definirSocieteRequete(null);
      appliquer(null, false);
      return;
    }
    if (user.role === "VENDEUR") {
      // Le serveur utilise toujours la société du vendeur.
      definirSocieteRequete(null);
      appliquer(user.societe ?? null, true);
      return;
    }
    // Admin : dernière société ouverte sur ce téléphone, revérifiée en ligne.
    let annule = false;
    (async () => {
      const { value } = await Preferences.get({ key: cle(user.id) });
      const memorisee = value ? (JSON.parse(value) as Societe) : null;
      if (annule) return;
      definirSocieteRequete(memorisee?.id ?? null);
      appliquer(memorisee, true);
      if (!memorisee) return;
      try {
        const fraiche = await getSociete(memorisee.id);
        if (!annule) {
          setSociete(fraiche);
          definirSocieteImprimee(fraiche);
          await Preferences.set({ key: cle(user.id), value: JSON.stringify(fraiche) });
        }
      } catch (err) {
        // Supprimée entre-temps : retour au choix. Pas de réseau : on garde la copie.
        if (!annule && err instanceof ApiError && err.status === 404) {
          await Preferences.remove({ key: cle(user.id) });
          definirSocieteRequete(null);
          appliquer(null, false);
        }
      }
    })();
    return () => {
      annule = true;
    };
  }, [user, appliquer]);

  const value = useMemo<SocieteContextValue>(
    () => ({
      societe,
      accueil,
      generation,
      precedente,
      async ouvrir(s) {
        if (!user) return;
        await Preferences.set({ key: cle(user.id), value: JSON.stringify(s) });
        definirSocieteRequete(s.id);
        setPrecedente(null);
        appliquer(s, true);
      },
      changer() {
        setPrecedente(societe);
        appliquer(null, false);
      },
      actualiser(s) {
        if (societe?.id !== s.id) return;
        setSociete(s);
        definirSocieteImprimee(s);
        if (user) void Preferences.set({ key: cle(user.id), value: JSON.stringify(s) });
      },
    }),
    [societe, accueil, generation, precedente, user, appliquer]
  );

  return <SocieteContext.Provider value={value}>{children}</SocieteContext.Provider>;
}

export function useSociete(): SocieteContextValue {
  const ctx = useContext(SocieteContext);
  if (!ctx) throw new Error("useSociete doit être utilisé dans un SocieteProvider");
  return ctx;
}
