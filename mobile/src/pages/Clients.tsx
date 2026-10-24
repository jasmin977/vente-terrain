import { useCallback, useEffect, useMemo, useState } from "react";
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
import { listClients, listCredits } from "../offline/donnees";
import { useApresSync } from "../offline/sync";
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
  FilterChip,
  PickerSheet,
  FabSpacer,
  Money,
  PageNotice,
  Row,
  SearchField,
  Section,
  Segmented,
  useEcranLarge,
  SkeletonList,
} from "../ui";
import { t, tn } from "../i18n";
import { useVueUrl } from "../utils/useVueUrl";

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
  // Filtre des crédits par vendeur (web et mobile) (celui qui a fait le bon de livraison).
  const [vendeurFiltre, setVendeurFiltre] = useState("");
  const [vendeurSheet, setVendeurSheet] = useState(false);

  // Ouverture directe sur les crédits (lien « Voir les crédits » du tableau de bord).
  const location = useLocation();
  // Web : Clients / Crédits se choisissent dans le menu latéral (?vue=…), pas par onglets.
  const web = useEcranLarge();
  useVueUrl("/clients", "vue", ["clients", "credits"] as const, setVue);
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

  // Vendeur : nouvelles données reçues après une synchronisation.
  const apresSync = useCallback(() => {
    if (vue === "credits") fetchCredits();
    else fetchClients();
  }, [vue, fetchCredits, fetchClients]);
  useApresSync(apresSync);

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

  const vendeursCredits = useMemo(() => {
    const m = new Map<string, { id: string; nom: string; code: string }>();
    for (const g of credits) for (const f of g.factures) m.set(f.vendeur.id, f.vendeur);
    return [...m.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  }, [credits]);
  const vendeurChoisi = vendeursCredits.find((v) => v.id === vendeurFiltre);
  // Avec un vendeur choisi : seuls ses bons restent, et le total de chaque client suit.
  const creditsAffiches = useMemo(() => {
    if (!vendeurChoisi) return credits;
    return credits
      .map((g) => {
        const factures = g.factures.filter((f) => f.vendeur.id === vendeurChoisi.id);
        return { ...g, factures, totalDu: factures.reduce((s, f) => s + f.reste, 0) };
      })
      .filter((g) => g.factures.length > 0);
  }, [credits, vendeurChoisi]);

  return (
    <IonPage className={web && vue === "credits" ? "rc-page--large rc-credits-page" : undefined}>
      <AppHeader
        large
        eyebrow={web && vue === "credits" ? t("Clients") : undefined}
        title={web && vue === "credits" ? t("Liste des crédits") : t("Liste des clients")}
        actions={<AccountButton />}
      >
        {!web && (
          <Segmented
            label={t("Affichage")}
            value={vue}
            onChange={setVue}
            options={[
              { value: "clients", label: t("Clients") },
              { value: "credits", label: t("Crédits") },
            ]}
          />
        )}
        {vue === "clients" ? (
          <SearchField value={query} onChange={setQuery} placeholder={t("Code, commerce, ville…")} />
        ) : (
          <SearchField value={creditQuery} onChange={setCreditQuery} placeholder={t("Client ou N° de bon…")} />
        )}
        {vue === "credits" && vendeursCredits.length > 1 && (
          <div>
            <FilterChip
              label={vendeurChoisi ? vendeurChoisi.nom : t("Tous les vendeurs")}
              active={Boolean(vendeurChoisi)}
              ariaLabel={t("Filtrer par vendeur")}
              onOpen={() => setVendeurSheet(true)}
            />
          </div>
        )}
        {/* Web : « Ajouter une avance » sur la même ligne que la recherche et le filtre, à droite. */}
        {web && vue === "credits" && credits.length > 0 && (
          <Button className="rc-credits-avance" icon={cashOutline} onClick={() => setAvance({})}>
            {t("Ajouter une avance")}
          </Button>
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
              credits={creditsAffiches}
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
                        meta={joinMeta([client.ref ? `N° ${client.ref}` : null, client.code, client.ville, client.enAttente ? t("En attente d'envoi") : null])}
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

      {!web && vue === "credits" && credits.length > 0 && (
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
      <PickerSheet
        isOpen={vendeurSheet}
        title={t("Vendeur")}
        value={vendeurFiltre}
        onDismiss={() => setVendeurSheet(false)}
        onSelect={(v) => {
          setVendeurFiltre(v);
          setVendeurSheet(false);
        }}
        options={[
          { value: "", label: t("Tous les vendeurs") },
          ...vendeursCredits.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code })),
        ]}
      />
    </IonPage>
  );
}
