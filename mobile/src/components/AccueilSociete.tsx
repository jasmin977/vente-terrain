import { IonContent, IonPage } from "@ionic/react";
import type { Societe } from "../types/societe";
import { Spinner } from "../ui";
import { t } from "../i18n";
import SocieteLogo from "./SocieteLogo";

/** Écran d'accueil à l'ouverture d'une société : son logo et son nom. */
export default function AccueilSociete({ societe }: { societe: Societe }) {
  return (
    <IonPage>
      <IonContent>
        <div className="rc-splash rc-accueil-societe">
          <SocieteLogo nom={societe.nom} logo={societe.logo} size={112} />
          <p className="rc-accueil-societe__nom">{societe.nom}</p>
          {societe.activite && <p className="rc-accueil-societe__activite">{societe.activite}</p>}
          <Spinner label={t("Ouverture de la société")} />
        </div>
      </IonContent>
    </IonPage>
  );
}
