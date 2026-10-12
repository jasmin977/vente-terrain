import { useEffect, useState } from "react";

/** Largeur à partir de laquelle l'interface passe en mode « web » : barre latérale, contenu centré, boîtes de dialogue. */
export const LARGEUR_WEB = 768;

/** Vrai tant que la fenêtre correspond à la requête CSS (se met à jour quand on redimensionne). */
export function useMediaQuery(requete: string): boolean {
  const lire = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(requete).matches : false);
  const [vrai, setVrai] = useState(lire);
  useEffect(() => {
    if (!window.matchMedia) return;
    const liste = window.matchMedia(requete);
    const maj = () => setVrai(liste.matches);
    maj();
    liste.addEventListener("change", maj);
    return () => liste.removeEventListener("change", maj);
  }, [requete]);
  return vrai;
}

/** Écran large (ordinateur, tablette en paysage) : mise en page web. */
export const useEcranLarge = () => useMediaQuery(`(min-width: ${LARGEUR_WEB}px)`);
