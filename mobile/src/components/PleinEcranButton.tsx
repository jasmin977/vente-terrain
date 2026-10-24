import { useEffect, useState } from "react";
import { IonIcon } from "@ionic/react";
import { contractOutline, expandOutline } from "ionicons/icons";
import { Capacitor } from "@capacitor/core";
import { t } from "../i18n";

/** Bascule le plein écran du navigateur (version web uniquement). */
export default function PleinEcranButton() {
  const [actif, setActif] = useState(Boolean(document.fullscreenElement));

  useEffect(() => {
    const maj = () => setActif(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", maj);
    return () => document.removeEventListener("fullscreenchange", maj);
  }, []);

  if (Capacitor.isNativePlatform() || !document.fullscreenEnabled) return null;

  const basculer = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch(() => undefined);
  };

  const libelle = actif ? t("Quitter le plein écran") : t("Plein écran");
  return (
    <button type="button" className="rc-iconbtn" aria-label={libelle} title={libelle} aria-pressed={actif} onClick={basculer}>
      <IonIcon icon={actif ? contractOutline : expandOutline} aria-hidden="true" />
    </button>
  );
}
