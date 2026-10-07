import type { HTMLAttributes, ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { chevronForward } from "ionicons/icons";

interface RowProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  /** Plain label instead of a bold title (key/value rows). */
  label?: ReactNode;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  chevron?: boolean;
  compact?: boolean;
  muted?: boolean;
  /** Leading element is a 48px thumbnail — aligns separators to the text. */
  thumb?: boolean;
}

/** The single list-row primitive: lists, key/value lines, pickers. */
export default function Row({
  title,
  label,
  meta,
  leading,
  trailing,
  onClick,
  chevron,
  compact,
  muted,
  thumb,
  className,
  ...rest
}: RowProps) {
  const cls = [
    "rc-row",
    compact && "rc-row--compact",
    muted && "rc-row--muted",
    thumb && "rc-row--with-thumb",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      {leading && <span className="rc-row__lead">{leading}</span>}
      <span className="rc-row__body">
        {title && <span className="rc-row__title">{title}</span>}
        {label && <span className="rc-row__label">{label}</span>}
        {meta && <span className="rc-row__meta">{meta}</span>}
      </span>
      {trailing && <span className="rc-row__trail">{trailing}</span>}
      {chevron && <IonIcon className="rc-row__chev" icon={chevronForward} aria-hidden="true" />}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} {...rest}>
        {content}
      </button>
    );
  }
  return (
    <div className={cls} {...rest}>
      {content}
    </div>
  );
}
