import { useEffect, useLayoutEffect, type RefObject } from "react";

/**
 * Donne à l'élément toute la hauteur qui reste dans la fenêtre sous lui (jusqu'au bas de l'écran), recalculée
 * à chaque rendu et quand la fenêtre change de taille. Mesure réelle : pas de hauteur estimée à la main.
 */
export function useHauteurRestante(ref: RefObject<HTMLElement | null>, marge = 16, min = 220) {
  const ajuster = () => {
    const el = ref.current;
    if (!el) return;
    const haut = el.getBoundingClientRect().top;
    el.style.height = `${Math.max(min, Math.floor(window.innerHeight - haut - marge))}px`;
  };
  // À chaque rendu : la barre de sélection ou une alerte au-dessus peut déplacer l'élément.
  useLayoutEffect(ajuster);
  useEffect(() => {
    window.addEventListener("resize", ajuster);
    return () => window.removeEventListener("resize", ajuster);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
