import type { ButtonHTMLAttributes } from "react";
import { IonIcon } from "@ionic/react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "md" | "lg";
  block?: boolean;
  loading?: boolean;
  icon?: string;
}

export default function Button({
  variant = "primary",
  size = "md",
  block,
  loading,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  const cls = [
    "rc-btn",
    `rc-btn--${variant}`,
    size === "lg" && "rc-btn--lg",
    block && "rc-btn--block",
    loading && "rc-btn--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={cls} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {icon && <IonIcon icon={icon} aria-hidden="true" />}
      <span className="rc-btn__label">{children}</span>
      {loading && <span className="rc-btn__spinner" aria-hidden="true" />}
    </button>
  );
}
