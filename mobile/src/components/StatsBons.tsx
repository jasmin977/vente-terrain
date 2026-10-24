import { useMemo } from "react";
import { receiptOutline } from "ionicons/icons";
import type { Facture } from "../types/facture";
import { BarRanking, ColumnChart, Money } from "../ui";
import type { BarRankingItem, ColumnPoint } from "../ui";
import { Anneau, Carte, Kpi } from "./DashboardWeb";
import { t, tn } from "../i18n";
import { formatDate, formatLongDate, parseLocalDate, pieces, toLocalDateString } from "../utils/format";

interface Props {
  /** Bons de la période et des filtres choisis. */
  factures: Facture[];
  total: number;
  count: number;
  especes: number;
  cheque: number;
  virement: number;
  credit: number;
  nomVendeur: (f: Facture) => string;
}

const TOP = 5;
const JOURS_MAX = 31;

const classer = (m: Map<string, { label: string; value: number; sub?: string }>) =>
  [...m.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, TOP);

/** Indicateurs et graphiques au-dessus du tableau des bons : répartition des règlements, ventes par jour,
 *  chiffre d'affaires par vendeur, meilleurs clients et articles les plus vendus. */
export default function StatsBons({ factures, total, count, especes, cheque, virement, credit, nomVendeur }: Props) {
  const part = especes + cheque + virement + credit;

  const { jours, heures, jourUnique, vendeurs, clients, articles } = useMemo(() => {
    const valides = factures.filter((f) => f.statut !== "ANNULEE");

    // Ventes par jour : un point par jour de la période (les jours sans vente comptent pour zéro).
    const parJour = new Map<string, number>();
    for (const f of valides) {
      const j = toLocalDateString(new Date(f.date));
      parJour.set(j, (parJour.get(j) ?? 0) + Number(f.montantTTC));
    }
    const cles = [...parJour.keys()].sort();
    const points: ColumnPoint[] = [];
    if (cles.length > 0) {
      const fin = parseLocalDate(cles[cles.length - 1]);
      const debut = parseLocalDate(cles[0]);
      debut.setTime(Math.max(debut.getTime(), fin.getTime() - (JOURS_MAX - 1) * 86_400_000));
      for (const d = new Date(debut); d <= fin; d.setDate(d.getDate() + 1)) {
        const cle = toLocalDateString(d);
        points.push({ id: cle, axis: String(d.getDate()), label: formatLongDate(d), value: parJour.get(cle) ?? 0 });
      }
    }

    // Un seul jour : ventes heure par heure (0 h – 23 h) plutôt qu'une unique colonne.
    let heures: ColumnPoint[] | null = null;
    if (cles.length === 1) {
      const parHeure = Array.from({ length: 24 }, () => 0);
      for (const f of valides) parHeure[new Date(f.date).getHours()] += Number(f.montantTTC);
      heures = parHeure.map((value, h) => ({ id: `h${h}`, axis: `${h}h`, label: `${h}h – ${h + 1}h`, value }));
    }

    const parVendeur = new Map<string, { label: string; value: number; sub?: string }>();
    const parClient = new Map<string, { label: string; value: number; sub?: string }>();
    const parArticle = new Map<string, { label: string; value: number; sub?: string }>();
    for (const f of valides) {
      const v = parVendeur.get(f.vendeurId) ?? { label: nomVendeur(f), value: 0 };
      v.value += Number(f.montantTTC);
      parVendeur.set(f.vendeurId, v);

      const c = parClient.get(f.clientId) ?? {
        label: f.client?.nomCommerce ?? f.clientId,
        value: 0,
        sub: f.client?.ref ? `${t("N° client")} ${f.client.ref}` : undefined,
      };
      c.value += Number(f.montantTTC);
      parClient.set(f.clientId, c);

      for (const l of f.lignes ?? []) {
        const a = parArticle.get(l.articleId) ?? { label: l.article?.designation ?? l.articleId, value: 0 };
        a.value += Number(l.quantite);
        parArticle.set(l.articleId, a);
      }
    }

    const enBarres = (m: Map<string, { label: string; value: number; sub?: string }>, affiche: (v: number) => BarRankingItem["display"]): BarRankingItem[] =>
      classer(m).map(([id, v]) => ({ id, label: v.label, value: v.value, display: affiche(v.value), sub: v.sub }));

    return {
      jours: points,
      heures,
      jourUnique: cles.length === 1 ? parseLocalDate(cles[0]) : null,
      vendeurs: enBarres(parVendeur, (v) => <Money value={v} size="sm" />),
      clients: enBarres(parClient, (v) => <Money value={v} size="sm" />),
      articles: enBarres(parArticle, (v) => `${v} ${pieces(v)}`),
    };
  }, [factures, nomVendeur]);

  const vide = <p className="rc-footnote">{t("Aucune vente sur la période.")}</p>;

  return (
    <div className="rc-bl-stats">
      <div className="rc-bl-stats__kpis">
        <Kpi
          icone={receiptOutline}
          teinte="accent"
          titre={t("Total TTC")}
          valeur={<Money value={total} size="lg" />}
          pied={tn(count, "{n} bon de livraison", "{n} bons de livraison")}
        />
        <Carte titre={t("Répartition des encaissements")} className="rc-bl-stats__repartition">
          <Anneau
            total={part}
            parts={[
              { label: t("Espèces"), value: especes, color: "var(--rc-chart-especes)" },
              { label: t("Chèque"), value: cheque, color: "var(--rc-chart-cheque)" },
              { label: t("Virement"), value: virement, color: "var(--rc-chart-virement)" },
              { label: t("Crédit"), value: credit, color: "var(--rc-chart-credit)" },
            ]}
          />
        </Carte>
        <Carte titre={t("Chiffre d'affaires par vendeur")}>
          {vendeurs.length === 0 ? vide : <BarRanking label={t("Chiffre d'affaires par vendeur")} items={vendeurs} />}
        </Carte>
      </div>

      <div className="rc-bl-stats__graphiques">
        {heures && jourUnique ? (
          <Carte
            titre={t("Ventes par heure")}
            className="rc-bl-stats__jours"
            aside={<span className="rc-dash-card__periode">{formatDate(jourUnique)}</span>}
          >
            <ColumnChart key="heures" points={heures} label={t("Ventes par heure")} showAxis={(i) => i % 3 === 0} />
          </Carte>
        ) : (
          <Carte
            titre={t("Ventes par jour")}
            className="rc-bl-stats__jours"
            aside={jours.length > 1 ? <span className="rc-dash-card__periode">{formatDate(parseLocalDate(jours[0].id))} – {formatDate(parseLocalDate(jours[jours.length - 1].id))}</span> : undefined}
          >
            <ColumnChart key="jours" points={jours} label={t("Ventes par jour")} showAxis={(i) => jours.length <= 12 || i % 2 === 0} />
          </Carte>
        )}
        <Carte titre={t("Meilleurs clients")}>
          {clients.length === 0 ? vide : <BarRanking label={t("Meilleurs clients")} items={clients} tone="accent" />}
        </Carte>
        <Carte titre={t("Articles les plus vendus")}>
          {articles.length === 0 ? vide : <BarRanking label={t("Articles les plus vendus")} items={articles} />}
        </Carte>
      </div>
    </div>
  );
}
