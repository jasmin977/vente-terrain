import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import { checkmarkCircle, ellipseOutline } from "ionicons/icons";
import { getSociete } from "../api/societes";
import { useSociete } from "../societe/SocieteContext";
import type { Societe } from "../types/societe";
import { Button, Section } from "../ui";
import { t, tn } from "../i18n";
import ImportArticlesSheet from "./ImportArticlesSheet";

/**
 * Démarrage guidé d'une société (tableau de bord de l'admin) tant qu'elle n'a
 * pas d'articles ou pas de vendeur : 1) importer le catalogue, 2) ajouter les vendeurs.
 */
export default function DemarrageSociete() {
  const navigate = useNavigate();
  const { societe } = useSociete();
  const [etat, setEtat] = useState<Societe | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);

  const charger = useCallback(() => {
    if (societe) getSociete(societe.id).then(setEtat).catch(() => undefined);
  }, [societe]);

  useEffect(charger, [charger]);

  const nbArticles = etat?._count?.articles ?? 0;
  const nbVendeurs = etat?._count?.users ?? 0;
  if (!etat || (nbArticles > 0 && nbVendeurs > 0)) return null;

  const etape = (fait: boolean, titre: string, detail: string, action: React.ReactNode) => (
    <div className={`rc-etape${fait ? " rc-etape--faite" : ""}`}>
      <IonIcon icon={fait ? checkmarkCircle : ellipseOutline} aria-hidden="true" />
      <div className="rc-etape__texte">
        <p className="rc-etape__titre">{titre}</p>
        <p className="rc-etape__detail">{detail}</p>
      </div>
      {!fait && action}
    </div>
  );

  return (
    <Section label={t("Démarrer {nom}", { nom: etat.nom })}>
      <div className="rc-group rc-group--pad rc-demarrage">
        {etape(
          nbArticles > 0,
          t("1. Importer vos articles"),
          nbArticles > 0 ? tn(nbArticles, "{n} article au catalogue", "{n} articles au catalogue") : t("Depuis un fichier Excel : téléchargez le modèle, remplissez-le, importez-le."),
          <Button size="lg" onClick={() => setImportOuvert(true)}>
            {t("Importer")}
          </Button>
        )}
        {etape(
          nbVendeurs > 0,
          t("2. Ajouter vos vendeurs"),
          nbVendeurs > 0 ? tn(nbVendeurs, "{n} vendeur", "{n} vendeurs") : t("Chaque vendeur a son compte et son camion."),
          <Button size="lg" variant={nbArticles > 0 ? "primary" : "secondary"} onClick={() => navigate("/vendeurs/new")}>
            {t("Ajouter")}
          </Button>
        )}
      </div>
      <ImportArticlesSheet isOpen={importOuvert} onDismiss={() => setImportOuvert(false)} onImporte={charger} />
    </Section>
  );
}
