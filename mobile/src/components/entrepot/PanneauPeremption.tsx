import type { EntrepotData, SelectionEntrepot } from "../../types/entrepot";
import {
  detailPeremption,
  libellePeremption,
  ORDRE_PEREMPTION,
  couleurPeremptionCss,
  tonePeremption,
  type AnalysePeremption,
  type StatutPeremption,
} from "../../utils/peremptionEntrepot";
import { Button, Group, Notice, Row, Tag } from "../../ui";
import { calendarOutline } from "ionicons/icons";
import { t, tn } from "../../i18n";

interface Props {
  data: EntrepotData;
  analyse: AnalysePeremption;
  filtre: StatutPeremption | null;
  onFiltre: (s: StatutPeremption | null) => void;
  onVoirCase: (s: SelectionEntrepot) => void;
  /** Ouvre l'écran des dates d'expiration (dater, retirer). */
  onOuvrirDates: () => void;
}

/** Panneau « Péremption » du plan : ce qui doit être contrôlé (expiré, proche, sans date) et où le trouver. */
export default function PanneauPeremption({ analyse, filtre, onFiltre, onVoirCase, onOuvrirDates }: Props) {
  const total = analyse.aControler.length;
  const montres = analyse.aControler.slice(0, 14);
  return (
    <>
      <h3 className="rc-entrepot__sous-titre">{t("Dates d'expiration")}</h3>
      <Group>
        {ORDRE_PEREMPTION.map((s) => (
          <Row
            key={s}
            compact
            className={filtre === s ? "rc-row--choisie" : undefined}
            onClick={() => onFiltre(filtre === s ? null : s)}
            title={
              <span className="rc-entrepot__statut">
                <span className="rc-entrepot__point" style={{ background: couleurPeremptionCss(s) }} aria-hidden="true" />
                {libellePeremption(s)}
              </span>
            }
            trailing={<span className="rc-row__value rc-num">{tn(analyse.cases[s], "{n} case", "{n} cases")}</span>}
          />
        ))}
      </Group>
      {total === 0 ? (
        <Notice tone="info">{t("Rien à contrôler : toutes les dates des produits périssables rangés sont suivies et loin.")}</Notice>
      ) : (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("À contrôler")}</h3>
          <Group>
            {montres.map((c) => (
              <Row
                key={c.articleId}
                compact
                chevron
                title={c.designation}
                meta={`${t("{rack} · étage {n} · case {c}", { rack: c.rackNom, n: c.niveau + 1, c: c.travee + 1 })}${detailPeremption(c.info) ? ` · ${detailPeremption(c.info)}` : ""}`}
                trailing={
                  <Tag tone={tonePeremption(c.info.statut)} dot>
                    {libellePeremption(c.info.statut)}
                  </Tag>
                }
                onClick={() => onVoirCase({ type: "case", rackId: c.rackId, niveau: c.niveau, travee: c.travee })}
              />
            ))}
          </Group>
          {total > montres.length && <p className="rc-footnote">{t("{n} autres produits à contrôler.", { n: total - montres.length })}</p>}
        </>
      )}
      <Button variant="secondary" icon={calendarOutline} onClick={onOuvrirDates}>
        {t("Dater et retirer les lots")}
      </Button>
      <p className="rc-footnote">{t("Les produits en gris ne sont pas suivis : leur catégorie n'est pas périssable.")}</p>
    </>
  );
}
