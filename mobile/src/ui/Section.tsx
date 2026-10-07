import { useId, type ReactNode } from "react";

interface SectionProps {
  label?: ReactNode;
  aside?: ReactNode;
  /** Edge-to-edge content (lists); otherwise content sits inside the gutter. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}

export default function Section({ label, aside, flush, children, className }: SectionProps) {
  const id = useId();
  return (
    <section
      className={`rc-section${flush ? " rc-section--flush" : ""} ${className ?? ""}`}
      aria-labelledby={label ? id : undefined}
    >
      {(label || aside) && (
        <div className="rc-section__head">
          {label && (
            <h2 className="rc-section__label" id={id}>
              {label}
            </h2>
          )}
          {aside && <span className="rc-section__aside">{aside}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Group({ children, pad, className }: { children: ReactNode; pad?: boolean; className?: string }) {
  return <div className={`rc-group${pad ? " rc-group--pad" : ""} ${className ?? ""}`}>{children}</div>;
}
