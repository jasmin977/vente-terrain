import { IonSpinner } from "@ionic/react";
import { downloadOutline } from "ionicons/icons";
import { IconButton } from "../ui";

/** Bouton d'en-tête (télécharger / imprimer en A4) ; roue de chargement pendant la génération du PDF. */
export default function TelechargerA4Button({
  label,
  enCours,
  onClick,
  icon = downloadOutline,
}: {
  label: string;
  enCours: boolean;
  onClick: () => void;
  icon?: string;
}) {
  if (enCours) {
    return (
      <span className="rc-iconbtn" role="status" aria-label={label}>
        <IonSpinner name="crescent" style={{ width: 22, height: 22 }} aria-hidden="true" />
      </span>
    );
  }
  return <IconButton icon={icon} label={label} onClick={onClick} />;
}
