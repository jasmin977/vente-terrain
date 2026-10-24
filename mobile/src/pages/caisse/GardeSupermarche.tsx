import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { storefrontOutline } from "ionicons/icons";
import { useAuth } from "../../auth/AuthContext";
import { useSociete } from "../../societe/SocieteContext";
import { EmptyState } from "../../ui";
import { t } from "../../i18n";

/** Écrans de la caisse : réservés à l'admin d'une société de type supermarché. */
export default function GardeSupermarche({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { societe } = useSociete();
  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;
  if (societe && societe.type !== "SUPERMARCHE")
    return (
      <EmptyState
        icon={storefrontOutline}
        title={t("Réservé aux supermarchés")}
        message={t("Passez la société en type « Supermarché » (Sociétés › Modifier) pour gérer ses caisses.")}
      />
    );
  return <>{children}</>;
}
