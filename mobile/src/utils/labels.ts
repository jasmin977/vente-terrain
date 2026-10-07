import type { ModePaiement, StatutFacture, TypeVente } from "../types/facture";
import type { SensMouvement } from "../types/stock";
import type { MotifEcart, StatutInventaire } from "../types/inventaire";
import type { Tone } from "../ui/Tag";
import { t } from "../i18n";

// Libellés traduits à la lecture : chaque accès renvoie la langue courante.
function traduits<K extends string>(fr: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(fr) as K[]) Object.defineProperty(out, k, { enumerable: true, get: () => t(fr[k]) });
  return out;
}

// Libellés d'affichage des valeurs d'énumération renvoyées par l'API.
export const typeVenteLabel: Record<TypeVente, string> = traduits({
  COMPTANT: "Comptant",
  CREDIT: "Crédit",
});

export const typeVenteTone: Record<TypeVente, Tone> = {
  COMPTANT: "positive",
  CREDIT: "warning",
};

export const modePaiementLabel: Record<ModePaiement, string> = traduits({
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  TPE: "TPE",
});

export const statutLabel: Record<StatutFacture, string> = traduits({
  VALIDEE: "Validée",
  ANNULEE: "Annulée",
});

export const sensLabel: Record<SensMouvement, string> = traduits({
  CHARGEMENT: "Chargement",
  RETOUR: "Retour dépôt",
  VENTE: "Vente",
  AJUSTEMENT: "Ajustement",
  RETOUR_CLIENT: "Retour client",
});

export const sensTone: Record<SensMouvement, Tone> = {
  CHARGEMENT: "positive",
  RETOUR: "warning",
  VENTE: "accent",
  AJUSTEMENT: "neutral",
  RETOUR_CLIENT: "ink",
};

export const motifEcartLabel: Record<MotifEcart, string> = traduits({
  ENDOMMAGE: "Endommagé",
  PERDU: "Perdu",
  ECHANTILLON: "Échantillon gratuit",
  AUTRE: "Autre",
});

export const statutInventaireLabel: Record<StatutInventaire, string> = traduits({
  EN_COURS: "En cours",
  VALIDE: "Validé",
});

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
