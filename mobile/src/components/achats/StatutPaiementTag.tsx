import type { StatutPaiement } from "../../types/achat";
import { Tag } from "../../ui";
import type { Tone } from "../../ui";
import { t } from "../../i18n";

const LIBELLES: Record<StatutPaiement, string> = {
  PAYE: "Payé",
  PARTIEL: "Avance",
  NON_PAYE: "Non payé",
  FACTURE: "Facturé",
};
const TONS: Record<StatutPaiement, Tone> = { PAYE: "positive", PARTIEL: "warning", NON_PAYE: "danger", FACTURE: "info" };

/** État de paiement d'un BL ou d'une facture fournisseur. */
export default function StatutPaiementTag({ statut, numeroFacture }: { statut: StatutPaiement; numeroFacture?: string }) {
  return (
    <Tag tone={TONS[statut]} dot>
      {statut === "FACTURE" && numeroFacture ? t("Facturé · {n}", { n: numeroFacture }) : t(LIBELLES[statut])}
    </Tag>
  );
}
