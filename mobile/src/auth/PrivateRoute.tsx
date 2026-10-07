import { Navigate } from "react-router-dom";
import { IonContent, IonPage } from "@ionic/react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { Spinner } from "../ui";
import { t } from "../i18n";

export default function PrivateRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <IonPage>
        <IonContent>
          <div className="rc-splash">
            <img className="rc-brandmark" src="/brand-mark.png" alt="Revive Cosmetix" />
            <Spinner label={t("Ouverture de la session")} />
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
