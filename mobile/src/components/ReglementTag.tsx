import type { Reglement, TypeVente } from "../types/facture";
import { formatAmount } from "../utils/format";
import { typeVenteLabel, typeVenteTone } from "../utils/labels";
import { Tag } from "../ui";
import { t } from "../i18n";

/**
 * État de paiement d'une facture (colonne de droite des listes) :
 * Comptant · Crédit (rien de réglé) · Partiel + reste à payer · Crédit payé.
 */
export default function ReglementTag({ typeVente, reglement }: { typeVente: TypeVente; reglement?: Reglement | null }) {
  if (typeVente !== "CREDIT" || !reglement) {
    return (
      <Tag tone={typeVenteTone[typeVente]} dot>
        {typeVenteLabel[typeVente]}
      </Tag>
    );
  }
  if (reglement.reste <= 0) {
    return (
      <Tag tone="positive" dot>
        {t("Crédit payé")}
      </Tag>
    );
  }
  if (reglement.paye > 0) {
    return (
      <>
        <Tag tone="warning" dot>
          {t("Partiel")}
        </Tag>
        <span className="rc-row__note rc-num">{t("reste {m}", { m: formatAmount(reglement.reste) })}</span>
      </>
    );
  }
  return (
    <Tag tone="warning" dot>
      {typeVenteLabel.CREDIT}
    </Tag>
  );
}
