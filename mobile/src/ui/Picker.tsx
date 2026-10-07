import { useMemo, useState, type ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { checkmark, chevronDown, searchOutline } from "ionicons/icons";
import Sheet from "./Sheet";
import SearchField from "./SearchField";
import Row from "./Row";
import Button from "./Button";
import { EmptyState } from "./States";
import { texteCorrespond } from "../utils/articleSearch";
import { t } from "../i18n";

export interface PickerOption {
  value: string;
  label: string;
  meta?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Extra text matched by the search (codes, city…). */
  keywords?: string;
}

/* ---------- Trigger: looks like a field, opens a sheet ---------- */
interface PickerFieldProps {
  label: string;
  value?: string;
  meta?: ReactNode;
  placeholder: string;
  onOpen: () => void;
  required?: boolean;
  leading?: ReactNode;
}

export function PickerField({ label, value, meta, placeholder, onOpen, required, leading }: PickerFieldProps) {
  return (
    <div className="rc-field">
      <span className="rc-field__label">
        {label}
        {required && (
          <span className="rc-field__req" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <button type="button" className="rc-picker" onClick={onOpen} aria-haspopup="dialog" aria-label={`${label} : ${value ?? placeholder}`}>
        {leading}
        <span className="rc-picker__body">
          <span className={`rc-picker__value${value ? "" : " rc-picker__value--placeholder"}`}>{value ?? placeholder}</span>
          {value && meta && <span className="rc-picker__meta">{meta}</span>}
        </span>
        <IonIcon icon={chevronDown} aria-hidden="true" />
      </button>
    </div>
  );
}

/** Compact header filter chip (e.g. vendeur). */
export function FilterChip({ label, active, onOpen, ariaLabel }: { label: string; active?: boolean; onOpen: () => void; ariaLabel: string }) {
  return (
    <button type="button" className={`rc-chip${active ? " rc-chip--active" : ""}`} onClick={onOpen} aria-haspopup="dialog" aria-label={ariaLabel}>
      <span>{label}</span>
      <IonIcon icon={chevronDown} aria-hidden="true" />
    </button>
  );
}

/* ---------- Single-choice searchable sheet ---------- */
interface PickerSheetProps {
  isOpen: boolean;
  title: string;
  options: PickerOption[];
  value?: string;
  onSelect: (value: string) => void;
  onDismiss: () => void;
  searchPlaceholder?: string;
  emptyLabel?: string;
  /**
   * Active le scan de code-barres : reçoit le code lu et renvoie la valeur de
   * l'option correspondante (sélectionnée aussitôt) ou undefined (le code est
   * alors placé dans la recherche).
   */
  onScan?: (code: string) => string | undefined;
  /** Action épinglée en bas (ex. « Nouveau client ») ; reçoit la recherche en cours. */
  action?: { label: string; icon?: string; onClick: (query: string) => void };
}

export function PickerSheet({
  isOpen,
  title,
  options,
  value,
  onSelect,
  onDismiss,
  searchPlaceholder = t("Rechercher…"),
  emptyLabel = t("Aucun résultat"),
  onScan,
  action,
}: PickerSheetProps) {
  const [query, setQuery] = useState("");
  const searchable = options.length > 7 || Boolean(onScan);

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    return options.filter((o) => texteCorrespond(`${o.label} ${o.keywords ?? ""}`, query));
  }, [options, query]);

  return (
    <Sheet
      isOpen={isOpen}
      title={title}
      onDismiss={onDismiss}
      onWillPresent={() => setQuery("")}
      height={searchable ? "full" : "auto"}
      toolbar={
        searchable ? (
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={searchPlaceholder}
            onScan={
              onScan
                ? (code) => {
                    const match = onScan(code);
                    if (match !== undefined) onSelect(match);
                    else setQuery(code);
                  }
                : undefined
            }
          />
        ) : undefined
      }
      footer={
        action && (
          <Button variant="secondary" block icon={action.icon} onClick={() => action.onClick(query.trim())}>
            {action.label}
          </Button>
        )
      }
    >
      {filtered.length === 0 ? (
        <EmptyState icon={searchOutline} title={emptyLabel} message={t("Essayez un autre nom ou code.")} />
      ) : (
        <div role="listbox" aria-label={title}>
          {filtered.map((o) => {
            const selected = o.value === value;
            return (
              <Row
                key={o.value}
                role="option"
                aria-selected={selected}
                title={o.label}
                meta={o.meta}
                leading={o.leading}
                thumb={Boolean(o.leading)}
                trailing={
                  <>
                    {o.trailing}
                    {selected && <IonIcon icon={checkmark} style={{ fontSize: 22, color: "var(--rc-ink)" }} aria-hidden="true" />}
                  </>
                }
                onClick={() => onSelect(o.value)}
              />
            );
          })}
        </div>
      )}
    </Sheet>
  );
}
