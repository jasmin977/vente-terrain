import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import { alarmOutline, checkmarkCircleOutline, documentTextOutline, hourglassOutline, peopleOutline, storefrontOutline } from "ionicons/icons";
import { apiRequest } from "../api/client";
import type { TableauDeBord } from "../types/tableauDeBord";
import { formatAmount } from "../utils/format";
import { t, tn } from "../i18n";

interface Alerte {
  cle: string;
  icone: string;
  ton: "danger" | "warning" | "info";
  valeur: string;
  libelle: string;
  chemin: string;
}

/**
 * Tableau de bord › « À traiter » : seulement ce qui demande une action (traites qui arrivent à échéance, articles
 * qui expirent, fournisseurs à payer, crédits clients de plus de 60 jours, BL de vente à facturer). Rien : « À jour ».
 */
export default function DashboardAlertes({ d }: { d: TableauDeBord }) {
  const navigate = useNavigate();
  const [prochain, setProchain] = useState<{ traites: { montant: number }[]; expirations: unknown[] } | null>(null);

  useEffect(() => {
    apiRequest<{ traites: { montant: number }[]; expirations: unknown[] }>("/tableau-de-bord/activite")
      .then(setProchain)
      .catch(() => setProchain(null));
  }, []);

  const alertes: Alerte[] = [];
  if (prochain && prochain.traites.length > 0)
    alertes.push({
      cle: "traites",
      icone: alarmOutline,
      ton: "danger",
      valeur: `${formatAmount(prochain.traites.reduce((s, x) => s + x.montant, 0))} TND`,
      libelle: tn(prochain.traites.length, "{n} traite à échéance sous 10 jours", "{n} traites à échéance sous 10 jours"),
      chemin: "/fournisseurs/reglements",
    });
  if (prochain && prochain.expirations.length > 0)
    alertes.push({
      cle: "expirations",
      icone: hourglassOutline,
      ton: "danger",
      valeur: String(prochain.expirations.length),
      libelle: t("lots expirent dans les 2 semaines"),
      chemin: "/stock/peremptions",
    });
  if (d.fournisseurs.du > 0)
    alertes.push({
      cle: "fournisseurs",
      icone: storefrontOutline,
      ton: "warning",
      valeur: `${formatAmount(d.fournisseurs.du)} TND`,
      libelle: tn(d.fournisseurs.nbAPayer, "dû à {n} fournisseur", "dû à {n} fournisseurs"),
      chemin: "/fournisseurs/reglements",
    });
  if (d.credits.anciennete.plus60 > 0)
    alertes.push({
      cle: "credits",
      icone: peopleOutline,
      ton: "warning",
      valeur: `${formatAmount(d.credits.anciennete.plus60)} TND`,
      libelle: t("crédits clients de plus de 60 jours"),
      chemin: "/clients?vue=credits",
    });
  if (d.facturesVente.blAFacturer.nb > 0)
    alertes.push({
      cle: "bl",
      icone: documentTextOutline,
      ton: "info",
      valeur: String(d.facturesVente.blAFacturer.nb),
      libelle: t("BL de vente à facturer"),
      chemin: "/ventes/transformation",
    });

  return (
    <div className="rc-alertes">
      {alertes.length === 0 ? (
        <div className="rc-alerte rc-alerte--ok">
          <IonIcon icon={checkmarkCircleOutline} aria-hidden="true" />
          <span>
            <strong>{t("Tout est à jour")}</strong>
            <small>{t("Rien d'urgent à traiter.")}</small>
          </span>
        </div>
      ) : (
        alertes.map((a) => (
          <button key={a.cle} type="button" className={`rc-alerte rc-alerte--${a.ton}`} onClick={() => navigate(a.chemin)}>
            <IonIcon icon={a.icone} aria-hidden="true" />
            <span>
              <strong>{a.valeur}</strong>
              <small>{a.libelle}</small>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
