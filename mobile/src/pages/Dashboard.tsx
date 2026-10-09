import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  RefresherEventDetail,
  useIonViewWillEnter,
} from "@ionic/react";
import { chevronBackOutline, chevronForwardOutline } from "ionicons/icons";
import { getTableauDeBord } from "../api/tableauDeBord";
import type { PeriodeTableauDeBord, TableauDeBord } from "../types/tableauDeBord";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { getLocale, t, tn } from "../i18n";
import { formatAmount, formatLongDate, pieces } from "../utils/format";
import {
  AccountButton,
  AppHeader,
  BarRanking,
  Button,
  ColumnChart,
  Group,
  IconButton,
  Money,
  Notice,
  PageNotice,
  Row,
  Section,
  Segmented,
  SkeletonList,
  SplitBar,
  Tag,
} from "../ui";
import type { BarRankingItem, ColumnPoint } from "../ui";
import DemarrageSociete from "../components/DemarrageSociete";

const HACHURE_CREDIT = "repeating-linear-gradient(135deg, var(--rc-chart-credit) 0 2px, var(--rc-warning-soft) 2px 4px)";

/** Points du graphique : heures (jour), jours de la semaine, jours du mois. */
function points(d: TableauDeBord): ColumnPoint[] {
  return d.chiffreAffaires.serie.map((p, i) => {
    const date = new Date(p.debut);
    if (d.periode === "jour") {
      return { id: String(i), axis: `${i}`, label: t("{a}h – {b}h", { a: i, b: i + 1 }), value: p.montant };
    }
    const axis =
      d.periode === "semaine"
        ? date.toLocaleDateString(getLocale(), { weekday: "short" })
        : String(date.getDate());
    return { id: String(i), axis, label: formatLongDate(date), value: p.montant };
  });
}

/** Mois décalé de `decalage` mois par rapport au mois en cours (1er du mois). */
function moisDecale(decalage: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + decalage, 1);
}

function Evolution({ d, moisPasse }: { d: TableauDeBord; moisPasse: boolean }) {
  const e = d.chiffreAffaires.evolution;
  const reference =
    d.periode === "jour"
      ? t("par rapport à hier à la même heure")
      : d.periode === "semaine"
        ? t("par rapport à la semaine dernière à date")
        : moisPasse
          ? t("par rapport au mois précédent")
          : t("par rapport au mois dernier à date");
  if (e === null) {
    return (
      <p className="rc-summary__delta">
        {t("Aucune vente sur la période précédente.")}
      </p>
    );
  }
  const signe = e > 0 ? "+" : e < 0 ? "−" : "";
  return (
    <p className="rc-summary__delta">
      <Tag tone={e > 0 ? "positive" : e < 0 ? "danger" : "neutral"} dot>
        <bdi>{`${signe}${Math.abs(e).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} %`}</bdi>
      </Tag>
      <span>
        {reference} (<bdi>{formatAmount(d.chiffreAffaires.precedentTtc)}</bdi> {t("TND")})
      </span>
    </p>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [periode, setPeriode] = useState<PeriodeTableauDeBord>("jour");
  /** Période « mois » : 0 = mois en cours, -1 = mois précédent, etc. */
  const [decalageMois, setDecalageMois] = useState(0);
  const [data, setData] = useState<TableauDeBord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const moisPasse = periode === "mois" && decalageMois < 0;
  const mois = moisDecale(decalageMois);
  const moisParam = moisPasse ? `${mois.getFullYear()}-${String(mois.getMonth() + 1).padStart(2, "0")}` : undefined;
  const libelleMois = mois.toLocaleDateString(getLocale(), { month: "long", year: "numeric" });

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      setData(await getTableauDeBord(periode, moisParam));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger le tableau de bord"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, periode, moisParam]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Les chiffres changent après chaque vente / encaissement : recharge au retour sur l'écran.
  useIonViewWillEnter(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchData();
    e.detail.complete();
  };

  const serie = useMemo(() => (data ? points(data) : []), [data]);

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const libellePeriode =
    periode === "jour"
      ? t("Aujourd'hui")
      : periode === "semaine"
        ? t("Cette semaine")
        : moisPasse
          ? <span className="rc-cap">{libelleMois}</span>
          : t("Ce mois");

  const contenu = (d: TableauDeBord) => {
    const ca = d.chiffreAffaires;
    const pm = d.encaissements.parMode;
    const especes = (pm.ESPECES ?? 0) + (pm.TPE ?? 0); // anciens règlements TPE : comptés avec les espèces
    const cheque = pm.CHEQUE ?? 0;
    const virement = pm.VIREMENT ?? 0;
    const encaisse = especes + cheque + virement;
    const age = d.credits.anciennete;

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

    return (
      <>
        <div className="rc-summary">
          <p className="rc-summary__label">
            {libellePeriode} · {t("Chiffre d'affaires TTC")}
          </p>
          <Money value={ca.ttc} size="xl" />
          <span className="rc-summary__sub">
            {tn(ca.nbFactures, "{n} bon de livraison", "{n} bons de livraison")}
            {ca.nbFactures > 0 && <> · {t("panier moyen")} <Money value={ca.panierMoyen} size="sm" /></>}
          </span>
          <Evolution d={d} moisPasse={moisPasse} />
        </div>

        <Section label={periode === "jour" ? t("Ventes par heure") : t("Ventes par jour")}>
          <div className="rc-group rc-group--pad">
            <ColumnChart
              points={serie}
              label={periode === "jour" ? t("Ventes par heure") : t("Ventes par jour")}
              showAxis={(i) =>
                periode === "semaine" ? true : periode === "jour" ? i % 6 === 0 : i === 0 || (i + 1) % 5 === 0
              }
            />
          </div>
        </Section>

        <Section label={t("Encaissé sur la période")} aside={<Money value={encaisse} size="sm" />}>
          <div className="rc-group rc-group--pad">
            <SplitBar
              total={encaisse}
              parts={[
                { label: t("Espèces"), value: especes, color: "var(--rc-chart-especes)" },
                { label: t("Chèque"), value: cheque, color: "var(--rc-chart-cheque)" },
                { label: t("Virement"), value: virement, color: "var(--rc-chart-virement)" },
              ]}
            />
            <p className="rc-kpi__foot">
              {t("Ventes comptant et crédits recouvrés, à la date de l'encaissement.")}{" "}
              {ca.credit > 0 && (
                <>
                  {t("Vendu à crédit sur la période :")} <strong><bdi>{formatAmount(ca.credit)}</bdi> {t("TND")}</strong>
                </>
              )}
            </p>
          </div>
        </Section>

        <Section
          label={t("Crédits clients")}
          aside={d.credits.nbClients > 0 ? tn(d.credits.nbClients, "{n} client", "{n} clients") : undefined}
        >
          <div className="rc-group rc-group--pad">
            <div className="rc-fields">
              <div>
                <p className="rc-summary__label">{t("Reste à encaisser")}</p>
                <Money value={d.credits.totalDu} size="lg" tone={d.credits.totalDu > 0 ? "warning" : "default"} />
              </div>
              {d.credits.totalDu > 0 && (
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
              )}
              <Button variant="secondary" block onClick={() => navigate("/clients", { state: { vue: "credits" } })}>
                {t("Voir les crédits")}
              </Button>
            </div>
          </div>
        </Section>

        <Section label={t("Chiffre d'affaires par vendeur")}>
          <div className="rc-group rc-group--pad">
            {vendeurs.length === 0 ? (
              <p className="rc-footnote">{t("Aucun vendeur actif.")}</p>
            ) : (
              <BarRanking label={t("Chiffre d'affaires par vendeur")} items={vendeurs} />
            )}
          </div>
        </Section>

        <Section label={t("Meilleurs clients")}>
          <div className="rc-group rc-group--pad">
            {clients.length === 0 ? (
              <p className="rc-footnote">{t("Aucune vente sur la période.")}</p>
            ) : (
              <BarRanking label={t("Meilleurs clients")} items={clients} tone="accent" />
            )}
          </div>
        </Section>

        <Section label={t("Articles les plus vendus")}>
          <div className="rc-group rc-group--pad">
            {produits.length === 0 ? (
              <p className="rc-footnote">{t("Aucune vente sur la période.")}</p>
            ) : (
              <BarRanking label={t("Articles les plus vendus")} items={produits} />
            )}
          </div>
        </Section>

        <Section label={t("Marge brute")}>
          <Group>
            <Row compact label={t("Ventes HT")} trailing={<Money value={d.marge.caHT} />} />
            <Row
              compact
              label={t("Marge brute HT")}
              trailing={
                d.marge.taux === null ? (
                  <span className="rc-row__note">{t("Non calculée")}</span>
                ) : (
                  <>
                    <Money value={d.marge.ht} />
                    <span className="rc-row__note">{t("{p} % des ventes", { p: d.marge.taux.toLocaleString(getLocale()) })}</span>
                  </>
                )
              }
            />
          </Group>
          {!d.marge.complete && (
            <Notice tone="warning">
              {d.marge.taux === null
                ? t("Aucun article vendu n'a de prix d'achat : renseignez-les dans le catalogue pour calculer la marge.")
                : t("Marge calculée sur {p} % des ventes : des articles vendus n'ont pas de prix d'achat.", {
                    p: Math.round(d.marge.couverture * 100),
                  })}
            </Notice>
          )}
        </Section>

        <Section label={t("Valeur du stock")} aside={t("au prix de vente HT")}>
          <Group>
            <Row compact label={t("Dépôt")} trailing={<Money value={d.stock.depot} />} />
            <Row compact label={t("Camions")} trailing={<Money value={d.stock.camions} />} />
            <Row compact label={t("Total")} trailing={<Money value={d.stock.depot + d.stock.camions} size="lg" />} />
          </Group>
        </Section>
      </>
    );
  };

  return (
    <IonPage>
      <AppHeader large title={t("Tableau de bord")} actions={<AccountButton />}>
        <Segmented
          label={t("Période")}
          value={periode}
          onChange={setPeriode}
          options={[
            { value: "jour", label: t("Aujourd'hui") },
            { value: "semaine", label: t("Semaine") },
            { value: "mois", label: t("Mois") },
          ]}
        />
        {periode === "mois" && (
          <div className="rc-daystep">
            <IconButton
              icon={chevronBackOutline}
              className="rc-flip"
              label={t("Mois précédent")}
              variant="filled"
              onClick={() => setDecalageMois((m) => m - 1)}
            />
            <p className="rc-daystep__label rc-cap" aria-live="polite">
              {libelleMois}
            </p>
            <IconButton
              icon={chevronForwardOutline}
              className="rc-flip"
              label={t("Mois suivant")}
              variant="filled"
              disabled={decalageMois >= 0}
              onClick={() => setDecalageMois((m) => Math.min(0, m + 1))}
            />
          </div>
        )}
      </AppHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {error && (
          <PageNotice actionLabel={t("Réessayer")} onAction={() => { setLoading(true); fetchData(); }}>
            {error}
          </PageNotice>
        )}

        {/* Société encore vide : importer les articles puis ajouter les vendeurs. */}
        <DemarrageSociete />

        {loading && !data ? (
          <Section flush>
            <SkeletonList rows={6} />
          </Section>
        ) : (
          data && <div aria-busy={loading || undefined}>{contenu(data)}</div>
        )}
      </IonContent>
    </IonPage>
  );
}
