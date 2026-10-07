import { apiRequest } from "./client";
import type { PeriodeTableauDeBord, TableauDeBord } from "../types/tableauDeBord";

/** Tableau de bord global (admin). `mois` (« 2026-09 ») : un mois passé, avec la période « mois ». */
export function getTableauDeBord(periode: PeriodeTableauDeBord, mois?: string): Promise<TableauDeBord> {
  return apiRequest<TableauDeBord>(`/tableau-de-bord?periode=${periode}${mois ? `&mois=${mois}` : ""}`);
}
