import { useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
}

interface SegmentedProps<T extends string> {
  value: T | undefined;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  label: string;
  /** "tiles" = larger separate choices (e.g. payment modes). */
  variant?: "track" | "tiles";
  wrap?: boolean;
  /** Grille à 2 colonnes pour les libellés longs (avec wrap). */
  columns?: 2 | 4;
}

/** Single-choice control (radiogroup) used for every exclusive choice. */
export default function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  variant = "track",
  wrap,
  columns = 4,
}: SegmentedProps<T>) {
  const ref = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    onChange(options[next].value);
    ref.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
  };

  const selectedIndex = options.findIndex((o) => o.value === value);

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={label}
      className={`rc-seg${variant === "tiles" ? " rc-seg--tiles" : ""}${wrap ? " rc-seg--wrap" : ""}${wrap && columns === 2 ? " rc-seg--cols-2" : ""}${wrap && columns !== 2 && options.length === 3 ? " rc-seg--cols-3" : ""}`}
    >
      {options.map((opt, i) => {
        const checked = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (selectedIndex === -1 && i === 0) ? 0 : -1}
            className="rc-seg__opt"
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {opt.label}
            {opt.hint && <span className="rc-seg__hint">{opt.hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
