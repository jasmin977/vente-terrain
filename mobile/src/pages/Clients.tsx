import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  RefresherEventDetail,
  useIonViewWillEnter,
} from "@ionic/react";
import { addOutline, cashOutline, peopleOutline } from "ionicons/icons";
import { listClients } from "../api/clients";
import { listCredits } from "../api/credits";
import type { CreditClient, FactureCredit } from "../types/credit";
import CreditsList from "./CreditsList";
import { AvanceSheet, PayerFactureSheet } from "./CreditSheets";
import type { Client } from "../types/client";
import { ApiError } from "../api/client";
import { joinMeta } from "../utils/format";
import {
  AccountButton,
  ActionBar,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  FabSpacer,
  Money,
  PageNotice,
  Row,
  SearchField,
  Section,
  Segmented,
  SkeletonList,
} from "../ui";
import { t, tn } from "../i18n";

type Vue = "clients" | "credits";

export default function Clients() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vue « Crédits » : factures à crédit impayées regroupées par client.
  const [vue, setVue] = useState<Vue>("clients");
  const [creditQuery, setCreditQuery] = useState("");
  const [credits, setCredits] = useState<CreditClient[]>([]);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [aPayer, setAPayer] = useState<{ facture: FactureCredit; client: CreditClient["client"] } | null>(null);
  const [avance, setAvance] = useState<{ clientId?: string } | null>(null);

  // Ouverture directe sur les crédits (lien « Voir les crédits » du tableau de bord).
  const location = useLocation();
  useEffect(() => {
    if ((location.state as { vue?: Vue } | null)?.vue === "credits") setVue("credits");
  }, [location.state]);

  const fetchCredits = useCallback(async () => {
    setError(null);
    try {
      setCredits(await listCredits());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les crédits"));
    } finally {
      setCreditsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (vue === "credits") fetchCredits();
  }, [vue, fetchCredits]);

  // Retour sur l'écran (après une facture à crédit, etc.) : données à jour.
  useIonViewWillEnter(() => {
    if (vue === "credits") fetchCredits();
    else fetchClients();
  }, [vue, fetchCredits]);

  const apresEncaissement = () => {
    setAPayer(null);
    setAvance(null);
    fetchCredits();
    fetchClients();
  };

  const fetchClients = useCallback(async () => {
    setError(null);
    try {
      setClients(await listClients(query || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les clients"));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(fetchClients, 300);
    return () => clearTimeout(timeout);
  }, [fetchClients]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await (vue === "credits" ? fetchCredits() : fetchClients());
    e.detail.complete();
  };

  const firstLoad = loading && clients.length === 0;

  return (
    <IonPage>
      <AppHeader large title={t("Clients")} actions={<AccountButton />}>
        <Segmented
          label={t("Affichage")}
          value={vue}
          onChange={setVue}
          options={[
            { value: "clients", label: t("Clients") },
            { value: "credits", label: t("Crédits") },
          ]}
        />
        {vue === "clients" ? (
          <SearchField value={query} onChange={setQuery} placeholder={t("Code, commerce, ville…")} />
        ) : (
          <SearchField value={creditQuery} onChange={setCreditQuery} placeholder={t("Client ou date (06/10/2026)…")} />
        )}
      </AppHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {error && (
          <PageNotice actionLabel={t("Réessayer")} onAction={() => { setLoading(true); fetchClients(); }}>
            {error}
          </PageNotice>
        )}

        {vue === "credits" ? (
          <>
            <CreditsList
              credits={credits}
              loading={creditsLoading}
              query={creditQuery}
              onPayer={(facture, client) => setAPayer({ facture, client })}
              onAvance={(clientId) => setAvance({ clientId })}
            />
            <div style={{ height: 16 }} />
          </>
        ) : (
          <>
            <Section flush aside={!firstLoad && clients.length > 0 ? tn(clients.length, "{n} client", "{n} clients") : undefined}>
              {firstLoad ? (
                <SkeletonList />
              ) : !error && clients.length === 0 ? (
                <EmptyState
                  icon={peopleOutline}
                  title={t("Aucun client trouvé.")}
                  message={query ? t("Essayez un autre nom de commerce, code ou ville.") : undefined}
                />
              ) : (
                clients.length > 0 && (
                  <div className="rc-list">
                    {clients.map((client) => (
                      <Row
                        key={client.id}
                        onClick={() => navigate(`/clients/${client.id}`)}
                        title={client.nomCommerce}
                        meta={joinMeta([client.code, client.ville])}
                        trailing={
                          client.solde > 0 ? (
                            <Money value={client.solde} tone="warning" />
                          ) : (
                            <span className="rc-row__note">{t("Solde nul")}</span>
                          )
                        }
                      />
                    ))}
                  </div>
                )
              )}
            </Section>
            <FabSpacer />

            <Fab icon={addOutline} label={t("Nouveau client")} onClick={() => navigate("/clients/new")} />
          </>
        )}
      </IonContent>

      {vue === "credits" && credits.length > 0 && (
        <ActionBar aboveTabs>
          <Button size="lg" block icon={cashOutline} onClick={() => setAvance({})}>
            {t("Ajouter une avance")}
          </Button>
        </ActionBar>
      )}

      <PayerFactureSheet
        facture={aPayer?.facture ?? null}
        client={aPayer?.client ?? null}
        onDismiss={() => setAPayer(null)}
        onDone={apresEncaissement}
      />
      <AvanceSheet
        isOpen={avance !== null}
        credits={credits}
        clientId={avance?.clientId}
        onDismiss={() => setAvance(null)}
        onDone={apresEncaissement}
      />
    </IonPage>
  );
}
