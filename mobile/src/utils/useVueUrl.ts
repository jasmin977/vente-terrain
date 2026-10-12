import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Applique à l'écran le choix passé dans l'adresse (?lieu=camion, ?vue=credits…). Le menu latéral du
 * web ouvre les écrans ainsi ; sur téléphone ce sont des onglets dans la page, l'adresse reste muette.
 * Ionic garde les écrans montés : on ne réagit qu'aux adresses qui concernent cet écran (`chemin`).
 */
export function useVueUrl<T extends string>(chemin: string, cle: string, valides: readonly T[], appliquer: (valeur: T) => void) {
  const { pathname, search } = useLocation();
  const dernier = useRef(appliquer);
  dernier.current = appliquer;
  useEffect(() => {
    if (pathname.replace(/\/+$/, "") !== chemin) return;
    const valeur = new URLSearchParams(search).get(cle);
    if (valeur && (valides as readonly string[]).includes(valeur)) dernier.current(valeur as T);
    // `valides` est une constante de l'écran
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, search, chemin, cle]);
}
