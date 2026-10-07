import { formatAmount } from "../utils/format";
import { t } from "../i18n";

interface MoneyProps {
  value: number | string;
  size?: "sm" | "md" | "lg" | "xl";
  strike?: boolean;
  tone?: "default" | "danger" | "warning";
  className?: string;
}

/** Every on-screen amount: tabular figures, de-emphasised currency. */
export default function Money({ value, size = "md", strike, tone = "default", className }: MoneyProps) {
  const cls = [
    "rc-money",
    `rc-money--${size}`,
    strike && "rc-money--strike",
    tone !== "default" && `rc-money--${tone}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls}>
      {formatAmount(value)}
      <span className="rc-money__unit">{t("TND")}</span>
    </span>
  );
}
