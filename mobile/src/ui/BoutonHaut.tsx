import { IonIcon } from "@ionic/react";
import { arrowUp } from "ionicons/icons";
import { t } from "../i18n";

/** Flèche flottante « revenir en haut de la liste » (à placer dans l'<IonContent> qui défile). */
export default function BoutonHaut({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      slot="fixed"
      className={`rc-haut${visible ? " rc-haut--visible" : ""}`}
      onClick={onClick}
      aria-label={t("Revenir en haut de la liste")}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
    >
      <IonIcon icon={arrowUp} aria-hidden="true" />
    </button>
  );
}
