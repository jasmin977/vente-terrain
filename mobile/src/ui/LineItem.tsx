import type { ReactNode } from "react";
import { closeOutline } from "ionicons/icons";
import IconButton from "./IconButton";

interface LineItemProps {
  leading?: ReactNode;
  title: ReactNode;
  meta?: ReactNode;
  /** Quantity control (Stepper) or any input, bottom-left. */
  control: ReactNode;
  /** Line amount, bottom-right. */
  amount?: ReactNode;
  removeLabel: string;
  onRemove: () => void;
  error?: ReactNode;
}

/**
 * An editable document line (invoice, truck loading). Two tiers so the
 * 44px controls never compete with the product name for width.
 */
export default function LineItem({ leading, title, meta, control, amount, removeLabel, onRemove, error }: LineItemProps) {
  return (
    <div className={`rc-line${error ? " rc-line--error" : ""}`}>
      <div className="rc-line__top">
        {leading}
        <div className="rc-line__body">
          <span className="rc-line__title">{title}</span>
          {meta && <span className="rc-line__meta">{meta}</span>}
        </div>
        <IconButton icon={closeOutline} label={removeLabel} size="sm" onClick={onRemove} className="rc-line__remove" />
      </div>
      <div className="rc-line__bottom">
        {control}
        {amount && <span className="rc-line__amount">{amount}</span>}
      </div>
      {error && (
        <p className="rc-line__error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
