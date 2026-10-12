import { useState } from "react";
import { IonIcon } from "@ionic/react";
import { arrowDown, arrowUp, checkmark, swapVerticalOutline } from "ionicons/icons";
import { Row, Section, Segmented, Sheet } from "../ui";
import { t } from "../i18n";
import { CRITERES, CRITERES_CATALOGUE, libelleTri, type CleTri, type TriArticles } from "../utils/triArticles";

interface Props {
  value: TriArticles;
  onChange: (v: TriArticles) => void;
  /** Critères proposés (par défaut ceux du catalogue ; listes de stock : + quantité). */
  criteres?: CleTri[];
}

/** Bouton « Trier » au-dessus d'une liste d'articles : critère + sens. */
export default function TriArticlesButton({ value, onChange, criteres = CRITERES_CATALOGUE }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const parDefaut = value.cle === "defaut" && !value.inverse;
  const libelle = libelleTri(value.cle);
  return (
    <>
      <button
        type="button"
        className={`rc-chip rc-chip--sm${parDefaut ? "" : " rc-chip--active"}`}
        onClick={() => setOuvert(true)}
        aria-haspopup="dialog"
        aria-label={t("Trier : {ordre}", { ordre: `${libelle}, ${value.inverse ? t("Décroissant") : t("Croissant")}` })}
      >
        <IonIcon icon={parDefaut ? swapVerticalOutline : value.inverse ? arrowDown : arrowUp} aria-hidden="true" />
        <span>{parDefaut ? t("Trier") : libelle}</span>
      </button>
      <Sheet isOpen={ouvert} title={t("Trier les articles")} height="auto" onDismiss={() => setOuvert(false)}>
        <Section>
          <Segmented
            label={t("Sens du tri")}
            value={value.inverse ? "desc" : "asc"}
            onChange={(sens) => onChange({ ...value, inverse: sens === "desc" })}
            options={[
              {
                value: "asc",
                label: (
                  <span className="rc-seg__avec-icone">
                    <IonIcon icon={arrowUp} aria-hidden="true" />
                    {t("Croissant")}
                  </span>
                ),
              },
              {
                value: "desc",
                label: (
                  <span className="rc-seg__avec-icone">
                    <IonIcon icon={arrowDown} aria-hidden="true" />
                    {t("Décroissant")}
                  </span>
                ),
              },
            ]}
          />
        </Section>
        <div role="listbox" aria-label={t("Trier les articles")}>
          {criteres.map((cle) => CRITERES.find((c) => c.value === cle)!).map((c) => {
            const choisi = c.value === value.cle;
            return (
              <Row
                key={c.value}
                role="option"
                aria-selected={choisi}
                title={c.label()}
                trailing={choisi ? <IonIcon icon={checkmark} style={{ fontSize: 22, color: "var(--rc-ink)" }} aria-hidden="true" /> : undefined}
                onClick={() => {
                  onChange({ ...value, cle: c.value });
                  setOuvert(false);
                }}
              />
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
