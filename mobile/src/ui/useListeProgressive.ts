import { useMemo, useState } from "react";

const PAS = 50;

/**
 * Affichage progressif d'une longue liste (plus d'un millier d'articles) : seules les
 * premières lignes sont dessinées, les suivantes s'ajoutent quand on arrive en bas.
 * Les données restent entières en mémoire : recherche, tri et totaux portent donc sur
 * toute la liste (indispensable hors ligne).
 *
 * `cle` résume ce qui change l'ordre ou le contenu de la liste (recherche, tri, lieu…) :
 * quand elle change on repart des premières lignes. Un simple rechargement des données
 * (retour sur l'écran, synchro) garde en revanche les lignes déjà affichées.
 */
export function useListeProgressive<T>(items: T[], cle: string, pas = PAS) {
  const [etat, setEtat] = useState({ cle, n: pas });
  // Clé changée : on repart des premières lignes (état dérivé, recalculé pendant le rendu
  // pour ne jamais dessiner une fois la longue liste de l'ancienne recherche).
  if (etat.cle !== cle) setEtat({ cle, n: pas });
  const n = etat.cle === cle ? etat.n : pas;
  const visibles = useMemo(() => items.slice(0, n), [items, n]);
  return {
    visibles,
    /** Lignes pas encore affichées. */
    reste: Math.max(0, items.length - n),
    plus: () => setEtat({ cle, n: n + pas }),
  };
}
