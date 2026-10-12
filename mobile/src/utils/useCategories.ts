import { useCallback, useEffect, useState } from "react";
import { listCategories } from "../offline/donnees";
import { useApresSync } from "../offline/sync";
import type { Categorie } from "../types/categorie";

/**
 * Catégories de la société (admin : serveur ; vendeur : dernière copie du téléphone), rechargées
 * après une synchronisation. `chargees` : la première lecture est terminée.
 */
export function useCategories() {
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [chargees, setChargees] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setCategories(await listCategories());
    } catch {
      // pas de réseau et pas de copie : le catalogue reste utilisable sans filtre
    } finally {
      setChargees(true);
    }
  }, []);

  useEffect(() => {
    recharger();
  }, [recharger]);
  useApresSync(recharger);

  return { categories, chargees, recharger };
}
