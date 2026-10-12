import type { Categorie } from "../types/categorie";
import { t, tn } from "../i18n";

/** « 2026-10-22 » -> « 22/10/2026 ». */
export const dateFr = (iso: string) => iso.split("-").reverse().join("/");

/** « Expiré depuis 3 j », « Aujourd'hui », « Dans 12 j ». */
export function libelleJours(jours: number): string {
  if (jours < 0) return t("Expiré depuis {n} j", { n: -jours });
  if (jours === 0) return t("Aujourd'hui");
  return tn(jours, "Dans {n} jour", "Dans {n} jours");
}

/** Les dates d'expiration sont suivies pour cette catégorie (ou pour la catégorie principale qui la contient). */
export function suiviPeremption(cats: Categorie[], categorieId: string | null | undefined): boolean {
  const c = cats.find((x) => x.id === categorieId);
  if (!c) return false;
  if (c.perissable) return true;
  return c.parentId ? Boolean(cats.find((x) => x.id === c.parentId)?.perissable) : false;
}
