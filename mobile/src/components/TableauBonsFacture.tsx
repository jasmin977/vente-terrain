import type { LigneFacture } from "../types/facture";
import { Money } from "../ui";
import { formatDate } from "../utils/format";
import { t } from "../i18n";

interface BonAvecLignes {
  id: string;
  numero: string;
  date: string;
  lignes: LigneFacture[];
}

/** Articles d'une facture, bon par bon : une petite ligne d'en-tête avec le n° du bon, puis ses articles. */
export default function TableauBonsFacture({ bons, sansDate = false }: { bons: BonAvecLignes[]; sansDate?: boolean }) {
  return (
    <div className="rc-tdonnees">
      <table aria-label={t("Articles de la facture")}>
        <thead>
          <tr>
            <th scope="col">{t("Code-barres")}</th>
            <th scope="col">{t("Désignation")}</th>
            <th scope="col" style={{ textAlign: "end" }}>{t("Quantité")}</th>
            <th scope="col" style={{ textAlign: "end" }}>{t("Prix unitaire HT")}</th>
            <th scope="col" style={{ textAlign: "end" }}>{t("TVA")}</th>
            <th scope="col" style={{ textAlign: "end" }}>{t("Total TTC")}</th>
          </tr>
        </thead>
        {bons.map((b) => (
          <tbody key={b.id}>
            <tr className="rc-transfo__groupe">
              <th colSpan={6} scope="colgroup">
                {sansDate ? `${t("BL n°")} ${b.numero}` : `${t("BL n°")} ${b.numero} · ${formatDate(b.date)}`}
              </th>
            </tr>
            {b.lignes.map((l) => (
              <tr key={l.id}>
                <td>{l.article.codeBarre ?? "—"}</td>
                <td className="rc-tdonnees__principale rc-tdonnees__souple">{l.article.designation}</td>
                <td style={{ textAlign: "end" }}>{Number(l.quantite)}</td>
                <td style={{ textAlign: "end" }}><Money value={Number(l.prixUnitaire)} /></td>
                <td style={{ textAlign: "end" }}>{Number(l.tauxTva)} %</td>
                <td style={{ textAlign: "end" }}><Money value={Number(l.montantTTC)} /></td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
