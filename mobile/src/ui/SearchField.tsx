import { useState } from "react";
import { IonIcon, useIonToast } from "@ionic/react";
import { barcodeOutline, closeCircle, searchOutline } from "ionicons/icons";
import { scannerCodeBarre } from "../lib/barcode";
import { t } from "../i18n";

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label?: string;
  /**
   * Active le bouton de scan de code-barres dans le champ. Reçoit le code lu ;
   * par défaut (si non fourni) le champ n'a pas de scanner.
   */
  onScan?: (code: string) => void;
}

export default function SearchField({ value, onChange, placeholder, label = "Rechercher", onScan }: SearchFieldProps) {
  const [scanning, setScanning] = useState(false);
  const [toast] = useIonToast();

  const handleScan = async () => {
    if (!onScan || scanning) return;
    setScanning(true);
    const result = await scannerCodeBarre();
    setScanning(false);
    if ("code" in result) onScan(result.code);
    else if ("error" in result) toast({ message: result.error, duration: 3000, position: "top", cssClass: "rc-toast" });
  };

  return (
    <div className="rc-search" role="search">
      <IonIcon icon={searchOutline} aria-hidden="true" />
      <input
        type="search"
        enterKeyHint="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
      {value && (
        <button type="button" className="rc-iconbtn" aria-label={t("Effacer la recherche")} onClick={() => onChange("")}>
          <IonIcon icon={closeCircle} aria-hidden="true" style={{ fontSize: 20, color: "var(--rc-ink-3)" }} />
        </button>
      )}
      {onScan && (
        <button
          type="button"
          className="rc-search__scan"
          aria-label={t("Scanner un code-barres")}
          title={t("Scanner un code-barres")}
          aria-busy={scanning || undefined}
          disabled={scanning}
          onClick={handleScan}
        >
          <IonIcon icon={barcodeOutline} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
