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
import StatsBons from "../components/StatsBons";
import FacturesTrajet from "../components/FacturesTrajet";
import { ApiError } from "../api/client";
import { formatDate, formatLongDate, formatTime, joinMeta, parseLocalDate, toLocalDateString } from "../utils/format";
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
  SearchField,
  Segmented,
  SkeletonList,
  SplitBar,
  Tag,
  TableauDonnees,
  useEcranLarge,
} from "../ui";
import type { ColonneDonnees } from "../ui";
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
  const web = useEcranLarge();
  // Le vendeur crée ses bons ; l'admin aussi, au nom d'un vendeur (son camion livre).
  const canCreate = true;

  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [vendeurId, setVendeurId] = useState<string | undefined>(isAdmin ? undefined : user?.id);
  const [vendeurSheet, setVendeurSheet] = useState(false);
  const [mode, setMode] = useState<FilterMode>("jour");
  const [date, setDate] = useState(today);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);
  const [toutes, setToutes] = useState<Facture[]>([]);
  const [numBl, setNumBl] = useState("");
  const [numClient, setNumClient] = useState("");
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
      setToutes(await listFactures({ vendeurId, ...range }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les bons de livraison"));
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

  // Filtres de recherche : n° du bon (contient) et n° du client (exact).
  const factures = useMemo(() => {
    const bl = numBl.trim().toLowerCase();
    const cl = numClient.trim();
    return toutes.filter((f) => (!bl || f.numero.toLowerCase().includes(bl)) && (!cl || String(f.client?.ref ?? "") === cl));
  }, [toutes, numBl, numClient]);

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
  // Web : une colonne par information (N°, date, heure, client, vendeur, type, montant, règlement).
  const nomVendeur = (f: Facture) => vendeurs.find((v) => v.id === f.vendeurId)?.nom ?? f.vendeur?.nom ?? (f.vendeurId === user?.id ? user?.nom : null) ?? "—";
  const colonnes: ColonneDonnees<Facture>[] = [
    {
      id: "numero",
      titre: t("N° du bon"),
      principale: true,
      rendu: (f) => (
        <span className="rc-bl__numero">
          {f.numero}
          {f.factureVenteId && (
            <Tag tone="info" dot>
              {f.factureVente?.numero ? t("Facturé · {n}", { n: f.factureVente.numero }) : t("Facturé")}
            </Tag>
          )}
        </span>
      ),
      tri: (f) => f.numero,
    },
    { id: "date", titre: t("Date"), rendu: (f) => formatDate(f.date), tri: (f) => new Date(f.date).getTime(), largeur: "130px" },
    { id: "heure", titre: t("Heure"), rendu: (f) => formatTime(f.date), tri: (f) => formatTime(f.date), largeur: "90px" },
    { id: "client", titre: t("Client"), rendu: (f) => f.client?.nomCommerce ?? f.clientId, tri: (f) => f.client?.nomCommerce ?? "", souple: true },
    { id: "vendeur", titre: t("Vendeur"), rendu: nomVendeur, tri: nomVendeur, largeur: "110px" },
    { id: "montant", titre: t("Montant TTC"), rendu: (f) => <Money value={f.montantTTC} strike={f.statut === "ANNULEE"} />, tri: (f) => Number(f.montantTTC), aligne: "end", largeur: "150px" },
    {
      id: "reglement",
      titre: t("Règlement"),
      rendu: (f) =>
        f.erreurSync ? (
          <Tag tone="danger">{t("Refusée")}</Tag>
        ) : f.enAttente ? (
          <Tag tone="warning" dot>
            {t("En attente")}
          </Tag>
        ) : f.statut === "ANNULEE" ? (
          <Tag tone="danger">{statutLabel.ANNULEE}</Tag>
        ) : (
          <ReglementTag typeVente={f.typeVente} reglement={f.reglement} />
        ),
      largeur: "160px",
    },
  ];
  const firstLoad = loading && factures.length === 0;

  return (
    <IonPage className={web ? "rc-page--large" : undefined}>
      <AppHeader large eyebrow={formatLongDate(new Date())} title={t("Liste des B° Livraison")} actions={<AccountButton />}>
        {isAdmin && !web && (
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

        {/* Web (≥ 900 px) : filtres et synthèse dans une colonne à gauche, la liste à droite. */}
        <div className="rc-bl">
        <div className="rc-bl__filtres">
        {isAdmin && (
        <div className="rc-bl__barre">
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
                hideLabel
                prefix={<span className="rc-bl__prefixe">{t("Du")}</span>}
                type="date"
                value={dateFrom}
                max={dateTo}
                onChange={(v) => setDateFrom(v || dateFrom)}
              />
              <Field
                label={t("Au")}
                hideLabel
                prefix={<span className="rc-bl__prefixe">{t("Au")}</span>}
                type="date"
                value={dateTo}
                min={dateFrom}
                max={today}
                onChange={(v) => setDateTo(v || dateTo)}
              />
            </div>
          )}
        </div>
        <div className="rc-bl__recherches">
          <SearchField value={numBl} onChange={setNumBl} placeholder={t("N° BL…")} label={t("Rechercher par numéro de bon")} />
          <SearchField value={numClient} onChange={setNumClient} placeholder={t("N° client…")} label={t("Rechercher par numéro de client")} />
          {web && (
            <FilterChip
              label={vendeur ? vendeur.nom : t("Tous les vendeurs")}
              active={Boolean(vendeur)}
              ariaLabel={t("Filtrer par vendeur : {nom}", { nom: vendeur ? vendeur.nom : t("tous les vendeurs") })}
              onOpen={() => setVendeurSheet(true)}
            />
          )}
        </div>
        </div>
        )}

        {web ? (
          <StatsBons
            factures={factures}
            total={stats.total}
            count={stats.count}
            especes={stats.especes}
            cheque={stats.cheque}
            virement={stats.virement}
            credit={stats.credit}
            nomVendeur={nomVendeur}
          />
        ) : (
          <div className="rc-summary" aria-busy={loading || undefined}>
            <p className="rc-summary__label">{periodeLabel} · {t("Total TTC")}</p>
            <Money value={stats.total} size="xl" />
            <span className="rc-summary__sub">
              {tn(stats.count, "{n} bon de livraison", "{n} bons de livraison")}
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
        )}

        </div>
        <div className="rc-bl__liste">
        {error && <PageNotice actionLabel={t("Réessayer")} onAction={() => { setLoading(true); fetchFactures(); }}>{error}</PageNotice>}

        <Section flush label={t("Ventes")} aside={!firstLoad && factures.length > 0 ? `${factures.length}` : undefined}>
          {firstLoad ? (
            <SkeletonList rows={5} />
          ) : !error && factures.length === 0 ? (
            <EmptyState
              icon={documentTextOutline}
              title={t("Aucun bon de livraison pour cette période.")}
              message={t("Les ventes enregistrées apparaîtront ici.")}
              action={
                canCreate && (
                  <Button variant="secondary" icon={addOutline} onClick={() => navigate("/factures/new")}>
                    {t("Nouveau B° Livraison")}
                  </Button>
                )
              }
            />
          ) : (
            factures.length > 0 &&
            (web ? (
              <TableauDonnees
                label={t("Ventes")}
                lignes={factures}
                colonnes={colonnes}
                cle={(f) => f.id}
                onOuvrir={(f) => navigate(`/factures/${f.id}`)}
                attenuee={(f) => f.statut === "ANNULEE"}
                triInitial={{ colonne: "date", inverse: true }}
                pied={
                  <span className="rc-transfo__pied">
                    <strong>{tn(stats.count, "{n} bon de livraison", "{n} bons de livraison")}</strong>
                    <span>
                      {t("Total")} <Money value={stats.total} size="md" /> {t("TTC")}
                    </span>
                  </span>
                }
              />
            ) : (
              <div className="rc-list">
                {factures.map((f) => {
                  const annulee = f.statut === "ANNULEE";
                  return (
                    <Row
                      key={f.id}
                      muted={annulee}
                      onClick={() => navigate(`/factures/${f.id}`)}
                      title={f.client?.nomCommerce ?? f.clientId}
                      meta={joinMeta([
                        f.numero,
                        f.factureVenteId ? t("Facturé") : null,
                        mode === "jour" ? formatTime(f.date) : formatDate(f.date),
                        // Web, tous les vendeurs : qui a fait la vente.
                        web && isAdmin && !vendeurId ? vendeurs.find((v) => v.id === f.vendeurId)?.nom : null,
                      ])}
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
            ))
          )}
        </Section>

        {/* Admin, vue par jour : où ont eu lieu les ventes, dans l'ordre. */}
        {isAdmin && mode === "jour" && factures.length > 0 && <FacturesTrajet factures={factures} vendeurs={vendeurs} />}
        </div>
        </div>

        {canCreate && (
          <>
            <FabSpacer />
            <Fab icon={addOutline} label={t("Nouveau B° Livraison")} onClick={() => navigate("/factures/new")} />
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
