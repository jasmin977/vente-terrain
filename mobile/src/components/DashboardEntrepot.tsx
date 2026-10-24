import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonIcon } from "@ionic/react";
import { arrowForwardOutline, cubeOutline } from "ionicons/icons";
import { getEntrepot } from "../api/entrepot";
import type { EntrepotData } from "../types/entrepot";
import { Button } from "../ui";
import { compterCases, couleurCss, libelleStatut, pointsAttention, type StatutStock } from "../utils/statutEntrepot";
import { Carte } from "./DashboardWeb";
import { t, tn } from "../i18n";

const AFFICHES: StatutStock[] = ["RUPTURE", "BAS", "OK"];

/**
 * Tableau de bord › État du dépôt : cases du plan 3D en rupture, en stock bas et correctes, les points les plus
 * urgents, et l'accès direct au plan.
 */
export default function DashboardEntrepot() {
  const navigate = useNavigate();
  const [data, setData] = useState<EntrepotData | null>(null);
  const [indisponible, setIndisponible] = useState(false);

  useEffect(() => {
    getEntrepot()
      .then(setData)
      .catch(() => setIndisponible(true));
  }, []);

  const cases = useMemo(() => (data ? compterCases(data) : null), [data]);
  const attention = useMemo(() => (data ? pointsAttention(data, 3) : null), [data]);
  const totalCases = cases ? AFFICHES.reduce((s, k) => s + cases[k], 0) : 0;
  const ouvrir = () => navigate("/stock/entrepot");

  return (
    <Carte
      titre={t("État du dépôt")}
      aside={
        <button type="button" className="rc-dash-lien" onClick={ouvrir}>
          {t("Plan 3D")}
          <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
        </button>
      }
      className="rc-dash-card--plein rc-dash-depot"
    >
      {indisponible ? (
        <p className="rc-footnote">{t("Plan du dépôt indisponible.")}</p>
      ) : !data || !cases ? (
        <p className="rc-footnote">{t("Chargement…")}</p>
      ) : data.racks.length === 0 || totalCases === 0 ? (
        <p className="rc-footnote">{t("Aucun article rangé sur le plan : placez-les dans le plan 3D pour suivre le dépôt d'un coup d'œil.")}</p>
      ) : (
        <>
          <div className="rc-dash-depot__barre" role="img" aria-label={AFFICHES.map((k) => `${libelleStatut(k)} ${cases[k]}`).join(", ")}>
            {AFFICHES.filter((k) => cases[k] > 0).map((k) => (
              <span key={k} style={{ flexGrow: cases[k], background: couleurCss(k) }} />
            ))}
          </div>
          <ul className="rc-dash-depot__comptes">
            {AFFICHES.map((k) => (
              <li key={k}>
                <span className="rc-dash-depot__pastille" style={{ background: couleurCss(k) }} aria-hidden="true" />
                <strong>{cases[k]}</strong>
                <span>{libelleStatut(k)}</span>
              </li>
            ))}
          </ul>
          {attention && attention.total > 0 ? (
            <>
              <p className="rc-rank__title">{tn(attention.total, "{n} point à surveiller", "{n} points à surveiller")}</p>
              <ul className="rc-dash-depot__points">
                {attention.points.map((p) => (
                  <li key={`${p.rackId}-${p.niveau}-${p.travee}-${p.article.id}`}>
                    <span className="rc-dash-depot__pastille" style={{ background: couleurCss(p.article.statut) }} aria-hidden="true" />
                    <span className="rc-dash-depot__article">{p.article.designation}</span>
                    <span className="rc-dash-depot__lieu">{t("{rack} · étage {n} · case {c}", { rack: p.rackNom, n: p.niveau + 1, c: p.travee + 1 })}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="rc-footnote">{t("Tout le dépôt est en stock suffisant.")}</p>
          )}
        </>
      )}
      <Button variant="secondary" block icon={cubeOutline} onClick={ouvrir}>
        {t("Ouvrir le plan 3D")}
      </Button>
    </Carte>
  );
}
