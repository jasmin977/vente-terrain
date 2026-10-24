import { apiRequest } from "./client";
import type { PeriodeTableauDeBord, TableauDeBord } from "../types/tableauDeBord";

/** Tableau de bord global (admin). `mois` (« 2026-09 ») : un mois passé, avec la période « mois ». */
/** `plage` (PC) : période libre « AAAA-MM-JJ », du début du premier jour à la fin du dernier. */
export function getTableauDeBord(periode: PeriodeTableauDeBord, mois?: string, plage?: { du: string; au: string }): Promise<TableauDeBord> {
  if (plage) {
    const debut = new Date(`${plage.du}T00:00:00`).toISOString();
    const fin = new Date(`${plage.au}T23:59:59.999`).toISOString();
    return apiRequest<TableauDeBord>(`/tableau-de-bord?periode=mois&debut=${encodeURIComponent(debut)}&fin=${encodeURIComponent(fin)}`);
  }
  return apiRequest<TableauDeBord>(`/tableau-de-bord?periode=${periode}${mois ? `&mois=${mois}` : ""}`);
}
