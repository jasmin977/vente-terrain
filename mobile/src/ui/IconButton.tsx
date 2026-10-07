import type { ButtonHTMLAttributes } from "react";
import { IonIcon } from "@ionic/react";

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  icon: string;
  /** Accessible name — required, the button has no visible text. */
  label: string;
  variant?: "plain" | "filled";
  tone?: "default" | "danger";
  size?: "md" | "sm";
}

export default function IconButton({
  icon,
  label,
  variant = "plain",
  tone = "default",
  size = "md",
  className,
  type = "button",
  ...rest
}: IconButtonProps) {
  const cls = [
    "rc-iconbtn",
    variant === "filled" && "rc-iconbtn--filled",
    tone === "danger" && "rc-iconbtn--danger",
    size === "sm" && "rc-iconbtn--sm",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} aria-label={label} title={label} {...rest}>
      <IonIcon icon={icon} aria-hidden="true" />
    </button>
  );
}
