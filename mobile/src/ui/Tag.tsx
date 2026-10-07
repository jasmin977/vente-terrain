import type { ReactNode } from "react";

export type Tone = "neutral" | "positive" | "warning" | "danger" | "accent" | "ink";

interface TagProps {
  tone?: Tone;
  children: ReactNode;
  /** Leading dot: reinforces status without relying on color alone (text always present). */
  dot?: boolean;
}

export default function Tag({ tone = "neutral", children, dot }: TagProps) {
  return (
    <span className={`rc-tag rc-tag--${tone}`}>
      {dot && <span className="rc-tag__dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
