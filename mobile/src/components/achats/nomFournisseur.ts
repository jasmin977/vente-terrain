import { t } from "../../i18n";

/**
 * Nom affiché d'un fournisseur : « 12 · Société X », ou « Divers » (avec la précision du document,
 * ex. « Divers · Quincaillerie Ben Ali ») pour le fournisseur intégré des achats ponctuels.
 */
export function nomFournisseur(f: { ref: number; nom: string; divers?: boolean } | null | undefined, libre?: string | null, avecRef = true): string {
  if (!f) return "—";
  if (f.divers) return libre ? `${t("Divers")} · ${libre}` : t("Divers");
  return avecRef ? `${f.ref} · ${f.nom}` : f.nom;
}
