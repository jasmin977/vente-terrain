import { useState, type ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import {
  alertCircleOutline,
  arrowForwardOutline,
  cashOutline,
  cubeOutline,
  peopleOutline,
  receiptOutline,
  trendingUpOutline,
  walletOutline,
} from "ionicons/icons";
import type { TableauDeBord } from "../types/tableauDeBord";
import { BarRanking, ColumnChart, Money, Notice, Segmented, SplitBar, Tag } from "../ui";
import type { BarRankingItem, ColumnPoint } from "../ui";
import { getLocale, t, tn } from "../i18n";
import { formatAmount, formatLongDate, pieces } from "../utils/format";
import DashboardFinances from "./DashboardFinances";
import DashboardActivite from "./DashboardActivite";
import DashboardAlertes from "./DashboardAlertes";
import DashboardEntrepot from "./DashboardEntrepot";

const HACHURE_CREDIT = "repeating-linear-gradient(135deg, var(--rc-chart-credit) 0 2px, var(--rc-warning-soft) 2px 4px)";

interface Props {
  d: TableauDeBord;
  /** Libellé de la période (« Aujourd'hui », « Ce mois »…). */
  libellePeriode: ReactNode;
  moisPasse: boolean;
  serie: ColumnPoint[];
  onVoirCredits: () => void;
  onVoirArticles: () => void;
}

/** Mini courbe d'évolution (sans axes) pour une carte d'indicateur. */
function Courbe({ valeurs }: { valeurs: number[] }) {
  const max = Math.max(...valeurs, 0);
  if (valeurs.length < 2 || max <= 0) return <div className="rc-dash-kpi__courbe rc-dash-kpi__courbe--vide" aria-hidden="true" />;
  const w = 120;
  const h = 36;
  const pas = w / (valeurs.length - 1);
  const pts = valeurs.map((v, i) => `${(i * pas).toFixed(1)},${(h - 3 - (v / max) * (h - 8)).toFixed(1)}`);
  return (
    <svg className="rc-dash-kpi__courbe" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} className="rc-dash-kpi__aire" />
      <polyline points={pts.join(" ")} className="rc-dash-kpi__trait" />
    </svg>
  );
}

/** Carte d'indicateur : icône colorée, valeur, complément et courbe. */
export function Kpi({
  icone,
  teinte,
  titre,
  valeur,
  pied,
  courbe,
}: {
  icone: string;
  teinte: "accent" | "positive" | "warning" | "violet";
  titre: string;
  valeur: ReactNode;
  pied?: ReactNode;
  courbe?: number[];
}) {
  return (
    <section className={`rc-dash-card rc-dash-kpi rc-dash-kpi--${teinte}`} aria-label={titre}>
      <header className="rc-dash-kpi__tete">
        <span className="rc-dash-kpi__icone" aria-hidden="true">
          <IonIcon icon={icone} />
        </span>
        <h3 className="rc-dash-kpi__titre">{titre}</h3>
      </header>
      <div className="rc-dash-kpi__valeur">{valeur}</div>
      {pied && <div className="rc-dash-kpi__pied">{pied}</div>}
      {courbe && <Courbe valeurs={courbe} />}
    </section>
  );
}

export function Carte({ titre, aside, className, children }: { titre: string; aside?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`rc-dash-card ${className ?? ""}`} aria-label={titre}>
      <header className="rc-dash-card__tete">
        <h3 className="rc-dash-card__titre">{titre}</h3>
        {aside && <div className="rc-dash-card__aside">{aside}</div>}
      </header>
      {children}
    </section>
  );
}

/** Anneau de répartition des encaissements par mode (conic-gradient). */
export function Anneau({ parts, total }: { parts: { label: string; value: number; color: string }[]; total: number }) {
  let cumul = 0;
  const segments = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const debut = (cumul / total) * 100;
      cumul += p.value;
      return `${p.color} ${debut.toFixed(2)}% ${((cumul / total) * 100).toFixed(2)}%`;
    });
  const fond = total > 0 ? `conic-gradient(${segments.join(", ")})` : "var(--rc-fill)";
  return (
    <div className="rc-dash-anneau">
      <div className="rc-dash-anneau__rond" style={{ background: fond }} role="img" aria-label={t("Répartition des encaissements")}>
        <div className="rc-dash-anneau__trou">
          <span className="rc-dash-anneau__total">
            <Money value={total} size="md" />
          </span>
        </div>
      </div>
      <ul className="rc-dash-anneau__legende">
        {parts.map((p) => (
          <li key={p.label}>
            <span className="rc-dash-anneau__puce" style={{ background: p.color }} aria-hidden="true" />
            <span className="rc-dash-anneau__nom">{p.label}</span>
            <span className="rc-dash-anneau__val">
              <Money value={p.value} size="sm" />
              {total > 0 && <small>{Math.round((p.value / total) * 100)} %</small>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Titre d'une section du tableau de bord, sur toute la largeur de la grille. */
function TitreSection({ titre, sous }: { titre: string; sous?: ReactNode }) {
  return (
    <h2 className="rc-dash-section">
      {titre}
      {sous && <small>{sous}</small>}
    </h2>
  );
}

/**
 * Tableau de bord de l'admin sur grand écran, en deux onglets :
 * - Vue d'ensemble : « À traiter » (seulement ce qui demande une action), Ventes, Achats & charges, Clients & stock ;
 * - Saisies du jour : ce qui a été saisi un jour donné (achats, règlements, articles, prix, dépenses).
 */
export default function DashboardWeb({ d, libellePeriode, moisPasse, serie, onVoirCredits, onVoirArticles }: Props) {
  const ca = d.chiffreAffaires;
  const pm = d.encaissements.parMode;
  const especes = (pm.ESPECES ?? 0) + (pm.TPE ?? 0);
  const cheque = pm.CHEQUE ?? 0;
  const virement = pm.VIREMENT ?? 0;
  const encaisse = especes + cheque + virement;
  const age = d.credits.anciennete;
  const periode = d.periode;
  const [onglet, setOnglet] = useState<"ensemble" | "saisies">("ensemble");

  const reference =
    periode === "plage"
      ? t("par rapport à la même durée juste avant")
      : periode === "jour"
      ? t("par rapport à la veille")
      : periode === "semaine"
        ? t("par rapport à la semaine dernière à date")
        : moisPasse
          ? t("par rapport au mois précédent")
          : t("par rapport au mois dernier à date");
  const e = ca.evolution;
  const delta =
    e === null ? (
      <span className="rc-dash-kpi__note">{t("Aucune vente sur la période précédente.")}</span>
    ) : (
      <>
        <Tag tone={e > 0 ? "positive" : e < 0 ? "danger" : "neutral"} dot>
          <bdi>{`${e > 0 ? "+" : e < 0 ? "−" : ""}${Math.abs(e).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} %`}</bdi>
        </Tag>
        <span className="rc-dash-kpi__note">{reference}</span>
      </>
    );

  const vendeurs: BarRankingItem[] = d.vendeurs.map((v) => ({
    id: v.id,
    label: `${v.nom} (${v.code})`,
    value: v.montant,
    display: <Money value={v.montant} size="sm" />,
    sub: tn(v.nbFactures, "{n} bon de livraison", "{n} bons de livraison"),
  }));
  const clients: BarRankingItem[] = d.topClients.map((c) => ({
    id: c.id,
    label: c.nomCommerce,
    value: c.montant,
    display: <Money value={c.montant} size="sm" />,
    sub: tn(c.nb, "{n} bon de livraison", "{n} bons de livraison"),
  }));
  const produits: BarRankingItem[] = d.topProduits.map((p) => ({
    id: p.articleId,
    label: p.designation,
    value: p.quantite,
    display: `${p.quantite} ${pieces(p.quantite)}`,
    sub: t("{m} TND HT", { m: formatAmount(p.montantHT) }),
  }));
  const debiteurs: BarRankingItem[] = d.credits.topDebiteurs.map((c) => ({
    id: c.clientId,
    label: c.client?.nomCommerce ?? "—",
    value: c.totalDu,
    display: <Money value={c.totalDu} size="sm" />,
    sub: c.plusAncienne ? t("Plus ancien bon de livraison : {d}", { d: formatLongDate(c.plusAncienne) }) : undefined,
  }));

  const titreSerie = d.pas === "heure" || periode === "jour" ? t("Ventes par heure") : d.pas === "mois" ? t("Ventes par mois") : t("Ventes par jour");
  const valeursSerie = ca.serie.map((p) => p.montant);

  const marge = d.marge;

  return (
    <div className="rc-dash">
      <div className="rc-dash-onglets">
        <Segmented
          label={t("Affichage")}
          variant="onglets"
          value={onglet}
          onChange={setOnglet}
          options={[
            { value: "ensemble", label: t("Vue d'ensemble") },
            { value: "saisies", label: t("Saisies du jour") },
          ]}
        />
      </div>

      {onglet === "saisies" ? (
        <DashboardActivite />
      ) : (
        <>
          {/* ---- À traiter ---- */}
          <TitreSection titre={t("À traiter")} />
          <DashboardAlertes d={d} />

          {/* ---- Ventes ---- */}
          <TitreSection titre={t("Ventes")} sous={libellePeriode} />
          <Kpi
            icone={trendingUpOutline}
            teinte="accent"
            titre={t("Chiffre d'affaires TTC")}
            valeur={<Money value={ca.ttc} size="xl" />}
            pied={delta}
            courbe={valeursSerie}
          />
          <Kpi
            icone={receiptOutline}
            teinte="violet"
            titre={tn(ca.nbFactures, "{n} bon de livraison", "{n} bons de livraison")}
            valeur={ca.nbFactures > 0 ? <Money value={ca.panierMoyen} size="xl" /> : <span className="rc-dash-kpi__vide">—</span>}
            pied={<span className="rc-dash-kpi__note">{t("Panier moyen")}</span>}
          />
          <Kpi
            icone={cashOutline}
            teinte="positive"
            titre={t("Encaissé")}
            valeur={<Money value={encaisse} size="xl" />}
            pied={
              ca.credit > 0 ? (
                <span className="rc-dash-kpi__note">
                  {t("Vendu à crédit :")} <strong><bdi>{formatAmount(ca.credit)}</bdi> {t("TND")}</strong>
                </span>
              ) : (
                <span className="rc-dash-kpi__note">{t("Ventes comptant et crédits recouvrés.")}</span>
              )
            }
          />
          <Kpi
            icone={walletOutline}
            teinte="positive"
            titre={t("Marge brute HT")}
            valeur={marge.taux === null ? <span className="rc-dash-kpi__vide">—</span> : <Money value={marge.ht} size="xl" />}
            pied={
              <span className="rc-dash-kpi__note">
                {marge.taux === null
                  ? t("Renseignez les prix d'achat pour la calculer.")
                  : `${t("{p} % des ventes", { p: marge.taux.toLocaleString(getLocale()) })}${marge.complete ? "" : ` · ${t("calculée sur {p} %", { p: Math.round(marge.couverture * 100) })}`}`}
              </span>
            }
          />

          <Carte titre={titreSerie} aside={<span className="rc-dash-card__periode">{libellePeriode}</span>} className="rc-dash-card--evolution">
            <ColumnChart
              points={serie}
              label={titreSerie}
              showAxis={(i) => (serie.length <= 12 ? true : d.pas === "heure" || periode === "jour" ? i % 3 === 0 : i === 0 || (i + 1) % 5 === 0)}
            />
          </Carte>
          <Carte titre={t("Répartition des encaissements")} className="rc-dash-card--repartition">
            <Anneau
              total={encaisse}
              parts={[
                { label: t("Espèces"), value: especes, color: "var(--rc-chart-especes)" },
                { label: t("Chèque"), value: cheque, color: "var(--rc-chart-cheque)" },
                { label: t("Virement"), value: virement, color: "var(--rc-chart-virement)" },
              ]}
            />
          </Carte>

          <Carte titre={t("Meilleurs clients")} aside={<IonIcon icon={peopleOutline} aria-hidden="true" />} className="rc-dash-card--tiers">
            {clients.length === 0 ? <p className="rc-footnote">{t("Aucune vente sur la période.")}</p> : <BarRanking label={t("Meilleurs clients")} items={clients} tone="accent" />}
          </Carte>
          <Carte
            titre={t("Articles les plus vendus")}
            aside={
              <button type="button" className="rc-dash-lien" onClick={onVoirArticles}>
                <IonIcon icon={cubeOutline} aria-hidden="true" />
              </button>
            }
            className="rc-dash-card--tiers"
          >
            {produits.length === 0 ? <p className="rc-footnote">{t("Aucune vente sur la période.")}</p> : <BarRanking label={t("Articles les plus vendus")} items={produits} />}
          </Carte>
          <Carte titre={t("Chiffre d'affaires par vendeur")} aside={<IonIcon icon={peopleOutline} aria-hidden="true" />} className="rc-dash-card--tiers">
            {vendeurs.length === 0 ? <p className="rc-footnote">{t("Aucun vendeur actif.")}</p> : <BarRanking label={t("Chiffre d'affaires par vendeur")} items={vendeurs} />}
          </Carte>

          {/* ---- Achats & charges ---- */}
          <TitreSection titre={t("Achats & charges")} sous={libellePeriode} />
          <DashboardFinances d={d} />

          {/* ---- Clients & stock ---- */}
          <TitreSection titre={t("Clients & stock")} sous={t("à aujourd'hui")} />
          <Carte
            titre={t("Crédits clients")}
            aside={
              <button type="button" className="rc-dash-lien" onClick={onVoirCredits}>
                {t("Voir les crédits")}
                <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
              </button>
            }
            className="rc-dash-card--credits"
          >
            <div className="rc-dash-credits__total">
              <p className="rc-summary__label">{tn(d.credits.nbClients, "Reste à encaisser · {n} client", "Reste à encaisser · {n} clients")}</p>
              <Money value={d.credits.totalDu} size="xl" tone={d.credits.totalDu > 0 ? "warning" : "default"} />
            </div>
            {d.credits.totalDu > 0 ? (
              <>
                <SplitBar
                  total={d.credits.totalDu}
                  parts={[
                    { label: t("Moins de 30 jours"), value: age.moins30, color: HACHURE_CREDIT },
                    { label: t("30 à 60 jours"), value: age.de30a60, color: "var(--rc-chart-credit)" },
                    { label: t("Plus de 60 jours"), value: age.plus60, color: "var(--rc-danger)" },
                  ]}
                />
                <p className="rc-rank__title">{t("Plus gros débiteurs")}</p>
                <BarRanking label={t("Plus gros débiteurs")} items={debiteurs} />
              </>
            ) : (
              <p className="rc-footnote">{t("Aucun crédit en cours.")}</p>
            )}
          </Carte>
          <div className="rc-dash-col">
            <DashboardEntrepot />
            <Carte titre={t("Valeur du stock")} aside={<span className="rc-dash-card__periode">{t("au prix de vente HT")}</span>} className="rc-dash-card--plein">
              <dl className="rc-dash-liste">
                <div>
                  <dt>{t("Dépôt")}</dt>
                  <dd>
                    <Money value={d.stock.depot} />
                  </dd>
                </div>
                <div>
                  <dt>{t("Camions")}</dt>
                  <dd>
                    <Money value={d.stock.camions} />
                  </dd>
                </div>
                <div className="rc-dash-liste__total">
                  <dt>{t("Total")}</dt>
                  <dd>
                    <Money value={d.stock.depot + d.stock.camions} size="lg" />
                  </dd>
                </div>
              </dl>
            </Carte>
            {!marge.complete && marge.taux !== null && (
              <Notice tone="warning" icon={alertCircleOutline}>
                {t("Marge calculée sur {p} % des ventes : des articles vendus n'ont pas de prix d'achat.", { p: Math.round(marge.couverture * 100) })}
              </Notice>
            )}
          </div>
        </>
      )}
    </div>
  );
}
