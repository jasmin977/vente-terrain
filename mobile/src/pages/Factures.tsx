import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  RefresherEventDetail,
  useIonViewWillEnter,
} from "@ionic/react";
import { addOutline, chevronBackOutline, chevronForwardOutline, documentTextOutline } from "ionicons/icons";
import { listFactures } from "../offline/donnees";
import { useApresSync } from "../offline/sync";
import { listUsers } from "../api/auth";
import type { Facture, ModePaiement } from "../types/facture";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import FacturesTrajet from "../components/FacturesTrajet";
import { ApiError } from "../api/client";
import { formatDate, formatLongDate, formatTime, parseLocalDate, toLocalDateString } from "../utils/format";
import { statutLabel } from "../utils/labels";
import ReglementTag from "../components/ReglementTag";
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  FabSpacer,
  Field,
  FilterChip,
  IconButton,
  Money,
  PageNotice,
  PickerSheet,
  Row,
  Section,
  Segmented,
  SkeletonList,
  SplitBar,
  Tag,
} from "../ui";
import { t, tn } from "../i18n";

type FilterMode = "jour" | "intervalle";

const today = toLocalDateString(new Date());
const ALL = "__all__";

const shiftDay = (value: string, delta: number) => {
  const d = parseLocalDate(value);
  d.setDate(d.getDate() + delta);
  return toLocalDateString(d);
};

export default function Factures() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  // Seuls les vendeurs créent des factures. Pour la réactiver côté admin, remplacer
  // par `true` : l'écran /factures/new et l'API POST /factures restent en place.
  const canCreate = !isAdmin;

  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [vendeurId, setVendeurId] = useState<string | undefined>(isAdmin ? undefined : user?.id);
  const [vendeurSheet, setVendeurSheet] = useState(false);
  const [mode, setMode] = useState<FilterMode>("jour");
  const [date, setDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers()
      .then((list) => setVendeurs(list.filter((u) => u.role === "VENDEUR" && u.actif)))
      .catch(() => undefined);
  }, [isAdmin]);

  const fetchFactures = useCallback(async () => {
    setError(null);
    try {
      // Vendeur : uniquement ses factures du jour (le serveur l'impose aussi).
      const jour = toLocalDateString(new Date());
      const range = !isAdmin
        ? { dateFrom: jour, dateTo: jour }
        : mode === "jour"
          ? { dateFrom: date, dateTo: date }
          : { dateFrom, dateTo };
      setFactures(await listFactures({ vendeurId, ...range }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les factures"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, vendeurId, mode, date, dateFrom, dateTo]);

  useEffect(() => {
    setLoading(true);
    fetchFactures();
  }, [fetchFactures]);

  // Ionic garde la page montée : on recharge à chaque retour sur l'écran
  // (après une entrée, un chargement, une facture…) pour ne pas afficher de données périmées.
  useIonViewWillEnter(() => {
    fetchFactures();
  }, [fetchFactures]);
  // Vendeur : la liste se met à jour après chaque synchronisation (factures envoyées).
  useApresSync(fetchFactures);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchFactures();
    e.detail.complete();
  };

  const stats = useMemo(() => {
    const valides = factures.filter((f) => f.statut !== "ANNULEE");
    // Encaissé par mode : ventes comptant + ce qui a déjà été payé sur les ventes
    // à crédit (dans le mode du paiement ou de l'avance). « Crédit » = reste dû.
    const parMode = (mode: ModePaiement) =>
      valides.reduce((s, f) => {
        if (f.typeVente === "COMPTANT") return s + (f.modePaiement === mode ? Number(f.montantTTC) : 0);
        return s + (f.reglement?.parMode?.[mode] ?? 0);
      }, 0);
    return {
      total: valides.reduce((s, f) => s + Number(f.montantTTC), 0),
      count: valides.length,
      especes: parMode("ESPECES"),
      cheque: parMode("CHEQUE"),
      virement: parMode("VIREMENT"),
      // Sans info de règlement, toute la facture à crédit est considérée due.
      credit: valides
        .filter((f) => f.typeVente === "CREDIT")
        .reduce((s, f) => s + (f.reglement ? f.reglement.reste : Number(f.montantTTC)), 0),
    };
  }, [factures]);

  const periodeLabel =
    mode === "jour"
      ? date === today
        ? t("Aujourd'hui")
        : formatLongDate(parseLocalDate(date))
      : t("Du {debut} au {fin}", { debut: formatDate(parseLocalDate(dateFrom)), fin: formatDate(parseLocalDate(dateTo)) });

  const vendeur = vendeurs.find((v) => v.id === vendeurId);
  const firstLoad = loading && factures.length === 0;

  return (
    <IonPage>
      <AppHeader large eyebrow={formatLongDate(new Date())} title={t("Factures")} actions={<AccountButton />}>
        {isAdmin && (
          <div>
            <FilterChip
              label={vendeur ? vendeur.nom : t("Tous les vendeurs")}
              active={Boolean(vendeur)}
              ariaLabel={t("Filtrer par vendeur : {nom}", { nom: vendeur ? vendeur.nom : t("tous les vendeurs") })}
              onOpen={() => setVendeurSheet(true)}
            />
          </div>
        )}
      </AppHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {isAdmin && (
        <div className="rc-period">
          <Segmented
            label={t("Période")}
            value={mode}
            onChange={setMode}
            options={[
              { value: "jour", label: t("Jour") },
              { value: "intervalle", label: t("Intervalle") },
            ]}
          />
          {mode === "jour" ? (
            <div className="rc-daystep">
              <IconButton
                icon={chevronBackOutline}
                className="rc-flip"
                label={t("Jour précédent")}
                variant="filled"
                onClick={() => setDate(shiftDay(date, -1))}
              />
              <Field
                label={t("Date")}
                hideLabel
                type="date"
                value={date}
                max={today}
                onChange={(v) => setDate(v || today)}
              />
              <IconButton
                icon={chevronForwardOutline}
                className="rc-flip"
                label={t("Jour suivant")}
                variant="filled"
                disabled={date >= today}
                onClick={() => setDate(shiftDay(date, 1))}
              />
            </div>
          ) : (
            <div className="rc-fields__row">
              <Field
                label={t("Du")}
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(v) => setDateFrom(v || dateFrom)}
              />
              <Field
                label={t("Au")}
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(v) => setDateTo(v || dateTo)}
              />
            </div>
          )}
        </div>
        )}

        <div className="rc-summary" aria-busy={loading || undefined}>
          <p className="rc-summary__label">{periodeLabel} · {t("Total TTC")}</p>
          <Money value={stats.total} size="xl" />
          <span className="rc-summary__sub">
            {tn(stats.count, "{n} facture", "{n} factures")}
          </span>
          <div className="rc-summary__split">
            <SplitBar
              total={stats.total}
              parts={[
                { label: t("Espèces"), value: stats.especes, color: "var(--rc-chart-especes)" },
                { label: t("Chèque"), value: stats.cheque, color: "var(--rc-chart-cheque)" },
                { label: t("Virement"), value: stats.virement, color: "var(--rc-chart-virement)" },
                {
                  label: t("Crédit"),
                  value: stats.credit,
                  // Hachuré : vendu mais pas encore encaissé (texture en plus de la couleur).
                  color: "repeating-linear-gradient(135deg, var(--rc-chart-credit) 0 2px, var(--rc-warning-soft) 2px 4px)",
                },
              ]}
            />
          </div>
        </div>

        {error && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setLoading(true); fetchFactures(); }}>{error}</PageNotice>}

        <Section flush label={t("Ventes")} aside={!firstLoad && factures.length > 0 ? `${factures.length}` : undefined}>
          {firstLoad ? (
            <SkeletonList rows={5} />
          ) : !error && factures.length === 0 ? (
            <EmptyState
              icon={documentTextOutline}
              title={t("Aucune facture pour cette période.")}
              message={t("Les ventes enregistrées apparaîtront ici.")}
              action={
                canCreate && (
                  <Button variant="secondary" icon={addOutline} onClick={() => navigate("/factures/new")}>
                    {t("Nouvelle facture")}
                  </Button>
                )
              }
            />
          ) : (
            factures.length > 0 && (
              <div className="rc-list">
                {factures.map((f) => {
                  const annulee = f.statut === "ANNULEE";
                  return (
                    <Row
                      key={f.id}
                      muted={annulee}
                      onClick={() => navigate(`/factures/${f.id}`)}
                      title={f.client?.nomCommerce ?? f.clientId}
                      meta={`${f.numero} · ${mode === "jour" ? formatTime(f.date) : formatDate(f.date)}`}
                      trailing={
                        <>
                          <Money value={f.montantTTC} strike={annulee} />
                          {f.erreurSync ? (
                            <Tag tone="danger">{t("Refusée")}</Tag>
                          ) : f.enAttente ? (
                            <Tag tone="warning" dot>
                              {t("En attente")}
                            </Tag>
                          ) : annulee ? (
                            <Tag tone="danger">{statutLabel.ANNULEE}</Tag>
                          ) : (
                            <ReglementTag typeVente={f.typeVente} reglement={f.reglement} />
                          )}
                        </>
                      }
                    />
                  );
                })}
              </div>
            )
          )}
        </Section>

        {/* Admin, vue par jour : où ont eu lieu les ventes, dans l'ordre. */}
        {isAdmin && mode === "jour" && factures.length > 0 && <FacturesTrajet factures={factures} vendeurs={vendeurs} />}

        {canCreate && (
          <>
            <FabSpacer />
            <Fab icon={addOutline} label={t("Nouvelle facture")} onClick={() => navigate("/factures/new")} />
          </>
        )}
      </IonContent>

      {isAdmin && (
        <PickerSheet
          isOpen={vendeurSheet}
          title={t("Vendeur")}
          value={vendeurId ?? ALL}
          onDismiss={() => setVendeurSheet(false)}
          onSelect={(v) => {
            setVendeurId(v === ALL ? undefined : v);
            setVendeurSheet(false);
          }}
          options={[
            { value: ALL, label: t("Tous les vendeurs") },
            ...vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code })),
          ]}
        />
      )}
    </IonPage>
  );
}
