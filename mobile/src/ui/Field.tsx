import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { alertCircle } from "ionicons/icons";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "prefix"> {
  label: string;
  value: string | number | undefined;
  onChange?: (value: string) => void;
  hint?: ReactNode;
  error?: string | null;
  /** Shown inside the box before the input (icon or text). */
  prefix?: ReactNode;
  /** Shown inside the box after the input (unit, scan button…). */
  suffix?: ReactNode;
  /** Read-only renders a plain value, distinct from an editable box. */
  readOnly?: boolean;
  /** Text appended to a read-only value (e.g. a unit). */
  staticSuffix?: string;
  /** Label kept for screen readers only (context makes it obvious). */
  hideLabel?: boolean;
}

export default function Field({
  label,
  value,
  onChange,
  hint,
  error,
  prefix,
  suffix,
  readOnly,
  staticSuffix,
  hideLabel,
  required,
  className,
  ...inputProps
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const empty = value === undefined || value === null || value === "";

  if (readOnly) {
    return (
      <div className={`rc-field rc-field--static ${className ?? ""}`}>
        <span className="rc-field__label" id={`${id}-label`}>
          {label}
        </span>
        <span
          className={`rc-field__static${empty ? " rc-field__static--empty" : ""}`}
          aria-labelledby={`${id}-label`}
        >
          {empty ? "—" : `${value}${staticSuffix ? ` ${staticSuffix}` : ""}`}
        </span>
      </div>
    );
  }

  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={`rc-field${error ? " rc-field--error" : ""} ${className ?? ""}`}>
      <label className={`rc-field__label${hideLabel ? " rc-visually-hidden" : ""}`} htmlFor={id}>
        {label}
        {required && (
          <span className="rc-field__req" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <div className="rc-field__box">
        {prefix && <span className="rc-field__prefix">{prefix}</span>}
        <input
          id={id}
          className="rc-field__input"
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...inputProps}
        />
        {suffix && <span className="rc-field__suffix">{suffix}</span>}
      </div>
      {error ? (
        <p className="rc-field__error" id={errorId} role="alert">
          <IonIcon icon={alertCircle} aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint && (
          <p className="rc-field__hint" id={hintId}>
            {hint}
          </p>
        )
      )}
    </div>
  );
}
