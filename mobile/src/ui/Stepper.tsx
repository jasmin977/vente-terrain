import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { addOutline, removeOutline } from "ionicons/icons";
import { t } from "../i18n";

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onStep: (delta: number) => void;
  onInput: (value: number) => void;
  /** Accessible name, e.g. "Quantité Crème 160 ML". */
  label: string;
  error?: boolean;
}

export default function Stepper({ value, min = 1, max, onStep, onInput, label, error }: StepperProps) {
  // Brouillon pendant la saisie : on peut vider le champ et retaper un nombre
  // sans qu'un 0 ne s'y réinsère ; la valeur minimale est rétablie à la sortie.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className={`rc-stepper${error ? " rc-stepper--error" : ""}`} role="group" aria-label={label}>
      <button type="button" aria-label={t("Diminuer")} onClick={() => onStep(-1)} disabled={value <= min}>
        <IonIcon icon={removeOutline} aria-hidden="true" />
      </button>
      <input
        type="number"
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error || undefined}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          if (e.target.value !== "") onInput(Number(e.target.value));
        }}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          if (draft === "") onInput(min);
          setDraft(null);
        }}
      />
      <button
        type="button"
        aria-label={t("Augmenter")}
        onClick={() => onStep(1)}
        disabled={max !== undefined && value >= max}
      >
        <IonIcon icon={addOutline} aria-hidden="true" />
      </button>
    </div>
  );
}
