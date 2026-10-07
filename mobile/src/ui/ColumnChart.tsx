import { useState } from "react";
import { formatAmount } from "../utils/format";
import { t } from "../i18n";

export interface ColumnPoint {
  id: string;
  /** Étiquette d'axe courte (« 6 », « lun. », « 14h »). */
  axis: string;
  /** Libellé complet annoncé et affiché au toucher (« mardi 6 octobre »). */
  label: string;
  value: number;
}

interface ColumnChartProps {
  points: ColumnPoint[];
  /** Nom du graphique (lecteurs d'écran). */
  label: string;
  /** Afficher l'étiquette d'axe de ce point (les autres restent muettes). */
  showAxis?: (index: number) => boolean;
}

/**
 * Colonnes verticales, une seule série : barres fines ancrées sur la ligne de
 * base, extrémité arrondie, maximum étiqueté directement. Toucher une colonne
 * affiche sa valeur (l'équivalent du survol sur mobile). Un tableau masqué
 * reprend toutes les valeurs pour les lecteurs d'écran.
 */
export default function ColumnChart({ points, label, showAxis = () => true }: ColumnChartProps) {
  const max = Math.max(0, ...points.map((p) => p.value));
  const meilleur = max > 0 ? points.findIndex((p) => p.value === max) : -1;
  const [selection, setSelection] = useState<number | null>(null);
  const actif = selection ?? meilleur;
  const point = actif >= 0 ? points[actif] : undefined;

  return (
    <figure className="rc-cols">
      <figcaption className="rc-cols__caption" aria-live="polite">
        {point ? (
          <>
            <span className="rc-cols__when">{selection === null ? t("Meilleur : {l}", { l: point.label }) : point.label}</span>
            <span className="rc-cols__value">
              {formatAmount(point.value)} <small>{t("TND")}</small>
            </span>
          </>
        ) : (
          <span className="rc-cols__when">{t("Aucune vente sur la période.")}</span>
        )}
      </figcaption>

      <div className="rc-cols__plot" aria-hidden="true">
        {points.map((p, i) => {
          const h = max > 0 && p.value > 0 ? Math.max(3, (p.value / max) * 100) : 0;
          return (
            <button
              key={p.id}
              type="button"
              tabIndex={-1}
              className={`rc-cols__col${i === actif ? " is-active" : ""}`}
              onClick={() => setSelection(i === selection ? null : i)}
            >
              <span className="rc-cols__bar" style={{ height: `${h}%` }} />
            </button>
          );
        })}
      </div>
      <div className="rc-cols__axis" aria-hidden="true">
        {points.map((p, i) => (
          <span key={p.id}>{showAxis(i) ? p.axis : ""}</span>
        ))}
      </div>

      <table className="rc-visually-hidden">
        <caption>{label}</caption>
        <tbody>
          {points.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.label}</th>
              <td>
                {formatAmount(p.value)} {t("TND")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
