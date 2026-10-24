import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { alertCircle, calendarOutline } from "ionicons/icons";
import { affichageVersIso, isoVersAffichage } from "../utils/format";

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

// Intervalle (Du / Au) : après validation du premier champ, le curseur passe au suivant.
function passerAuSuivant(champ: HTMLInputElement): boolean {
  const groupe = champ.closest(".rc-field")?.parentElement;
  if (!groupe) return false;
  const dates = Array.from(groupe.querySelectorAll<HTMLInputElement>("input[data-date]"));
  const suivant = dates[dates.indexOf(champ) + 1];
  if (!suivant) return false;
  suivant.focus();
  return true;
}

// Date en jj/mm/aaaa quelle que soit la locale du navigateur (un <input type="date">
// natif suit celle du système). La valeur échangée reste en ISO aaaa-mm-jj.
function DateInput({
  id,
  value,
  onChange,
  min,
  max,
  inputProps,
}: {
  id: string;
  value: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  inputProps: InputHTMLAttributes<HTMLInputElement>;
}) {
  const [texte, setTexte] = useState(isoVersAffichage(value));
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value !== (affichageVersIso(texte) ?? "")) setTexte(isoVersAffichage(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const saisie = (brut: string) => {
    const chiffres = brut.replace(/\D/g, "").slice(0, 8);
    let t = chiffres.slice(0, 2);
    if (chiffres.length > 2) t += "/" + chiffres.slice(2, 4);
    if (chiffres.length > 4) t += "/" + chiffres.slice(4);
    setTexte(t);
    const iso = affichageVersIso(t);
    if (iso && (!min || iso >= min) && (!max || iso <= max)) onChange?.(iso);
    else if (t === "") onChange?.("");
  };

  // Entrée : vide → aujourd'hui ; « jj » → mois et année courants ; « jj/mm » → année courante.
  const completer = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    // Champ facultatif (ex. date d'expiration) : vide, il le reste.
    if (texte.trim() === "" && e.currentTarget.dataset.videAutorise !== undefined) return;
    const [j, m, a] = texte.split("/");
    if (a && a.length === 4 && affichageVersIso(texte)) {
      if (passerAuSuivant(e.currentTarget)) e.preventDefault();
      return;
    }
    const auj = new Date();
    const jour = j ? Number(j) : auj.getDate();
    const mois = m ? Number(m) : auj.getMonth() + 1;
    const annee = a && a.length === 4 ? Number(a) : auj.getFullYear();
    const d = (n: number, l = 2) => String(n).padStart(l, "0");
    const complet = `${d(jour)}/${d(mois)}/${annee}`;
    const iso = affichageVersIso(complet);
    e.preventDefault();
    if (!iso || (min && iso < min) || (max && iso > max)) return;
    setTexte(complet);
    onChange?.(iso);
    passerAuSuivant(e.currentTarget);
  };

  const { type: _type, className: _c, ...reste } = inputProps;
  return (
    <>
      <input
        {...reste}
        id={id}
        className="rc-field__input"
        type="text"
        data-date=""
        inputMode="numeric"
        placeholder="jj/mm/aaaa"
        maxLength={10}
        value={texte}
        onChange={(e) => saisie(e.target.value)}
        onFocus={(e) => {
          const champ = e.currentTarget;
          // Après le clic : sinon le navigateur repositionne le curseur et annule la sélection.
          setTimeout(() => champ.select(), 0);
          reste.onFocus?.(e);
        }}
        onBlur={() => setTexte(isoVersAffichage(value))}
        onKeyDown={(e) => {
          completer(e);
          reste.onKeyDown?.(e);
        }}
      />
      <span className="rc-field__suffix">
        <button
          type="button"
          className="rc-field__datebtn"
          tabIndex={-1}
          aria-label="Calendrier"
          onClick={() => picker.current?.showPicker?.()}
        >
          <IonIcon icon={calendarOutline} aria-hidden="true" />
        </button>
        <input
          ref={picker}
          type="date"
          className="rc-field__datepicker"
          tabIndex={-1}
          aria-hidden="true"
          value={value}
          min={min}
          max={max}
          onChange={(e) => e.target.value && onChange?.(e.target.value)}
        />
      </span>
    </>
  );
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
        {inputProps.type === "date" ? (
          <DateInput
            id={id}
            value={String(value ?? "")}
            onChange={onChange}
            min={inputProps.min as string | undefined}
            max={inputProps.max as string | undefined}
            inputProps={{
              required,
              "aria-invalid": error ? true : undefined,
              "aria-describedby": describedBy,
              ...inputProps,
              min: undefined,
              max: undefined,
            }}
          />
        ) : (
          <>
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
          </>
        )}
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
