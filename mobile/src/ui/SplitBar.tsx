import Money from "./Money";

export interface SplitPart {
  label: string;
  value: number;
  /** CSS color token for the swatch/segment. */
  color: string;
}

/**
 * Proportion bar + labelled legend. Every part keeps its text label and
 * amount, so the bar is reinforcement — never the only carrier of meaning.
 */
export default function SplitBar({ parts, total }: { parts: SplitPart[]; total: number }) {
  return (
    <div className="rc-split">
      <div className="rc-split__bar" aria-hidden="true">
        {total > 0 ? (
          parts
            .filter((p) => p.value > 0)
            .map((p) => <span key={p.label} style={{ flexGrow: p.value, background: p.color }} />)
        ) : (
          <span style={{ flexGrow: 1, background: "var(--rc-fill)" }} />
        )}
      </div>
      <dl className="rc-split__legend">
        {parts.map((p) => (
          <div key={p.label} className="rc-split__item">
            <dt>
              <span className="rc-split__swatch" style={{ background: p.color }} aria-hidden="true" />
              {p.label}
            </dt>
            <dd>
              <Money value={p.value} size="md" />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
