import { useEffect, useRef } from "react";
import { t } from "../i18n";

/**
 * Bas d'une liste progressive : charge la suite dès qu'il approche de l'écran (on ne voit
 * jamais la coupure), et reste un bouton pour continuer à la main si besoin.
 */
export default function ChargerPlus({ reste, onPlus }: { reste: number; onPlus: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);

  // Un nouvel observateur à chaque tranche affichée : s'il est encore visible (grand écran,
  // lignes courtes), il redéclenche tout de suite jusqu'à remplir l'écran.
  useEffect(() => {
    const el = ref.current;
    if (!reste || !el || typeof IntersectionObserver === "undefined") return;
    const observateur = new IntersectionObserver((entrees) => entrees.some((e) => e.isIntersecting) && onPlus(), {
      rootMargin: "800px",
    });
    observateur.observe(el);
    return () => observateur.disconnect();
  }, [reste, onPlus]);

  if (!reste) return null;
  return (
    <button ref={ref} type="button" className="rc-charger-plus" onClick={onPlus}>
      {t("Afficher la suite · {n} restants", { n: reste })}
    </button>
  );
}
