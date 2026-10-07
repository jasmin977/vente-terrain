import type { ReactNode } from "react";

export interface BarRankingItem {
  id: string;
  label: string;
  value: number;
  /** Valeur affichée (ex. « 48 pièces ») ; la barre est proportionnelle à `value`. */
  display: ReactNode;
  /** Précision secondaire sous le libellé (ex. montant). */
  sub?: ReactNode;
}

interface BarRankingProps {
  items: BarRankingItem[];
  /** Nom du classement, annoncé aux lecteurs d'écran. */
  label: string;
  /** Échelle commune (sinon le max des éléments). */
  max?: number;
  tone?: "ink" | "accent";
}

/**
 * Classement en barres horizontales (une seule série, une seule couleur) :
 * libellé au-dessus, valeur étiquetée directement, barre ancrée à gauche.
 * C'est une liste HTML : lisible sans la couleur et par les lecteurs d'écran.
 */
export default function BarRanking({ items, label, max, tone = "ink" }: BarRankingProps) {
  const echelle = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className={`rc-rank rc-rank--${tone}`} aria-label={label}>
      {items.map((item, i) => {
        const pct = item.value > 0 ? Math.max(2, (item.value / echelle) * 100) : 0;
        return (
          <li key={item.id} className="rc-rank__item">
            <div className="rc-rank__head">
              <span className="rc-rank__pos" aria-hidden="true">
                {i + 1}
              </span>
              <span className="rc-rank__label">{item.label}</span>
              <span className="rc-rank__value">{item.display}</span>
            </div>
            <div className="rc-rank__track" aria-hidden="true">
              {pct > 0 ? <span className="rc-rank__bar" style={{ width: `${pct}%` }} /> : <span className="rc-rank__zero" />}
            </div>
            {item.sub && <span className="rc-rank__sub">{item.sub}</span>}
          </li>
        );
      })}
    </ol>
  );
}
