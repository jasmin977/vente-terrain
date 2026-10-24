// Statut de stock d'un article au dépôt, affiché en couleur sur le plan 3D :
//   RUPTURE (rouge)  stock <= 0
//   BAS     (orange) stock <= seuil d'alerte
//   NOUVEAU (bleu)   mis en avant (nouveauté ou promotion) et stock suffisant
//   OK      (vert)   stock suffisant
// Priorité : rupture > bas > mise en avant > ok (une nouveauté en rupture est d'abord une rupture).

export type StatutStock = "RUPTURE" | "BAS" | "NOUVEAU" | "OK";

/** Seuil d'alerte par défaut quand l'article n'a pas de stock minimum : 5 colis (5 pièces pour un article à la pièce). */
export const STOCK_MINI_COLIS = 5;
export const seuilParDefaut = (colisage: number) => STOCK_MINI_COLIS * Math.max(1, colisage);

export interface EntreeStatut {
  stock: number;
  colisage: number;
  stockMini: number | null;
  etiquette: "NOUVEAU" | "PROMOTION" | null;
  /** Fin de la mise en avant (date civile), null : sans fin. */
  etiquetteJusqua: Date | null;
}

export function seuilAlerte(a: Pick<EntreeStatut, "colisage" | "stockMini">) {
  return a.stockMini !== null && a.stockMini > 0 ? a.stockMini : seuilParDefaut(a.colisage);
}

/** Mise en avant encore valable aujourd'hui ? */
export function etiquetteActive(a: Pick<EntreeStatut, "etiquette" | "etiquetteJusqua">, maintenant = new Date()) {
  if (!a.etiquette) return null;
  if (a.etiquetteJusqua && a.etiquetteJusqua.getTime() + 86_400_000 <= maintenant.getTime()) return null;
  return a.etiquette;
}

export function statutStock(a: EntreeStatut, maintenant = new Date()): StatutStock {
  if (a.stock <= 1e-9) return "RUPTURE";
  if (a.stock <= seuilAlerte(a) + 1e-9) return "BAS";
  // Mise en avant (nouveauté / promotion) retirée pour l'instant : plus de bleu sur le plan.
  void maintenant;
  return "OK";
}
