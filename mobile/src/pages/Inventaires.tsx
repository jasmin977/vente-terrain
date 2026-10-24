import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  IonContent,
  IonPage,
  IonRefresher,
  IonRefresherContent,
  RefresherEventDetail,
  useIonViewWillEnter,
} from "@ionic/react";
import { addOutline, clipboardOutline } from "ionicons/icons";
import { DEPOT, getSuiviCategories, listInventaires, ouvrirInventaire } from "../api/inventaires";
import NouvelInventaireSheet from "../components/NouvelInventaireSheet";
import { listUsers } from "../api/auth";
import type { InventaireResume, SuiviCategorie } from "../types/inventaire";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { formatDate, formatDateTime } from "../utils/format";
import { statutInventaireLabel } from "../utils/labels";
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  FabSpacer,
  FilterChip,
  Money,
  PageNotice,
  PickerSheet,
  Row,
  Section,
  Segmented,
  useEcranLarge,
  SkeletonList,
  Tag,
} from "../ui";
import { t, tn } from "../i18n";
import { useVueUrl } from "../utils/useVueUrl";

const ALL = "__all__";

export default function Inventaires() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [inventaires, setInventaires] = useState<InventaireResume[]>([]);
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  // Deux vues séparées : le dépôt, ou les camions (éventuellement un seul : `filtre`).
  const [lieu, setLieu] = useState<"DEPOT" | "CAMION">("DEPOT");
  // Web : Dépôt / Camion se choisissent dans le menu latéral (?lieu=…), pas par onglets.
  const web = useEcranLarge();
  useVueUrl("/inventaires", "lieu", ["depot", "camion"] as const, (v) => {
    setLieu(v === "depot" ? "DEPOT" : "CAMION");
    setFiltre(undefined);
    setLoading(true);
  });
  const [filtre, setFiltre] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState<"filtre" | "nouveau" | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Dépôt : historique (par mois) ou suivi par catégorie (inventaire tournant).
  const [vueDepot, setVueDepot] = useState<"historique" | "suivi">("historique");
  const [statutFiltre, setStatutFiltre] = useState<"tous" | "EN_COURS" | "VALIDE">("tous");
  const [suivi, setSuivi] = useState<SuiviCategorie[]>([]);
  const [nouveauDepot, setNouveauDepot] = useState<{ preselection: string[] } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers()
      .then((list) => setVendeurs(list.filter((u) => u.role === "VENDEUR" && u.actif)))
      .catch(() => undefined);
  }, [isAdmin]);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      setInventaires(await listInventaires(lieu, filtre));
      if (lieu === "DEPOT") setSuivi(await getSuiviCategories().catch(() => []));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les inventaires"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, lieu, filtre]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Ionic garde la page montée : on recharge à chaque retour sur l'écran
  // (après une entrée, un chargement, une facture…) pour ne pas afficher de données périmées.
  useIonViewWillEnter(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchData();
    e.detail.complete();
  };

  const nouvelInventaire = async (cible: string, categorieIds: string[] = []) => {
    setSheet(null);
    setNouveauDepot(null);
    setOpening(true);
    setError(null);
    try {
      const inv = await ouvrirInventaire(cible, categorieIds);
      navigate(`/inventaires/${inv.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible d'ouvrir l'inventaire"));
    } finally {
      setOpening(false);
    }
  };

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const depot = lieu === "DEPOT";
  const vendeurFiltre = vendeurs.find((v) => v.id === filtre);
  const libelleFiltre = vendeurFiltre ? t("Camion de {nom}", { nom: vendeurFiltre.nom }) : t("Tous les camions");
  // Camions ayant déjà un inventaire en cours (liste affichée : vue Camion).
  const enCours = new Set(inventaires.filter((i) => i.statut === "EN_COURS").map((i) => i.vendeurId));
  const firstLoad = loading && inventaires.length === 0;
  // Inventaire de tout le dépôt en cours : aucune catégorie n'en est le point de départ, il se reprend d'ici.
  const toutDepotEnCours = depot ? inventaires.find((i) => i.statut === "EN_COURS" && !(i.categorieIds?.length)) : undefined;
  const affiches = inventaires.filter((i) => statutFiltre === "tous" || i.statut === statutFiltre);
  const parMois = (() => {
    const m = new Map<string, InventaireResume[]>();
    for (const inv of affiches) {
      const d = new Date(inv.statut === "VALIDE" ? inv.dateValidation ?? inv.createdAt : inv.createdAt);
      const cle = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      m.set(cle, [...(m.get(cle) ?? []), inv]);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  })();
  const libelleMois = (cle: string) => new Date(`${cle}-01T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  // Couleur du suivi : récent (< 30 j), à prévoir (30–90 j), en retard (> 90 j ou jamais).
  const tonSuivi = (c: SuiviCategorie) => (c.joursDepuis === null || c.joursDepuis > 90 ? "danger" : c.joursDepuis >= 30 ? "warning" : "positive");

  return (
    <IonPage>
      <AppHeader
        large
        eyebrow={web ? t("Inventaires") : undefined}
        title={web ? (lieu === "DEPOT" ? t("Dépôt") : t("Camion")) : t("Inventaires")}
        actions={<AccountButton />}
      >
        {!web && (
          <Segmented
            label={t("Lieu de l'inventaire")}
            value={lieu}
            onChange={(v) => {
              setLieu(v);
              setFiltre(undefined);
              setLoading(true);
            }}
            options={[
              { value: "DEPOT", label: t("Dépôt") },
              { value: "CAMION", label: t("Camion") },
            ]}
          />
        )}
        {!depot && (
          <div style={{ marginTop: "var(--rc-space-3)" }}>
            <FilterChip
              label={libelleFiltre}
              active={Boolean(filtre)}
              ariaLabel={t("Filtrer par camion : {nom}", { nom: libelleFiltre })}
              onOpen={() => setSheet("filtre")}
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

        {depot && (
          <div className="rc-inv__barre">
            <Segmented
              label={t("Affichage")}
              variant="onglets"
              value={vueDepot}
              onChange={setVueDepot}
              options={[
                { value: "historique", label: t("Historique") },
                { value: "suivi", label: t("Suivi par catégorie") },
              ]}
            />
            {vueDepot === "historique" && (
              <Segmented
                label={t("Statut")}
                value={statutFiltre}
                onChange={setStatutFiltre}
                options={[
                  { value: "tous", label: t("Tous") },
                  { value: "EN_COURS", label: t("En cours") },
                  { value: "VALIDE", label: t("Terminés") },
                ]}
              />
            )}
          </div>
        )}

        {depot && vueDepot === "suivi" ? (
          <Section flush label={t("Suivi par catégorie")} aside={`${suivi.length}`}>
            {toutDepotEnCours && (
              <div className="rc-avance rc-inv__tout-depot">
                <span>{t("Un inventaire de tout le dépôt est en cours : il couvre toutes les catégories.")}</span>
                <Button onClick={() => navigate(`/inventaires/${toutDepotEnCours.id}`)}>{t("Reprendre")}</Button>
              </div>
            )}
            {suivi.length === 0 ? (
              <EmptyState icon={clipboardOutline} title={t("Aucune catégorie.")} message={t("Créez des catégories dans le catalogue pour inventorier le dépôt par rayon.")} />
            ) : (
              <div className="rc-list">
                {suivi.map((c) => (
                  <Row
                    key={c.id}
                    title={<span style={{ paddingInlineStart: `${(c.chemin.split(" › ").length - 1) * 18}px` }}>{c.nom}</span>}
                    meta={`${tn(c.nbArticles, "{n} article", "{n} articles")}${
                      c.enCours && !c.enCours.principal
                        ? ` · ${t("incluse dans « {nom} »", { nom: c.enCours.libelle ?? t("Tout le dépôt") })}`
                        : c.dernierInventaire
                        ? ` · ${t("dernier inventaire le {d}", { d: formatDate(c.dernierInventaire.date) })}`
                        : ""
                    }`}
                    trailing={
                      <span className="rc-inv__suivi">
                        {c.enCours ? (
                          c.enCours.principal ? (
                            <Tag tone="accent" dot>
                              {t("En cours")}
                            </Tag>
                          ) : (
                            <Tag tone="neutral">{t("Inclus")}</Tag>
                          )
                        ) : (
                          <Tag tone={tonSuivi(c)} dot>
                            {c.joursDepuis === null ? t("Jamais") : c.joursDepuis === 0 ? t("Aujourd'hui") : t("Il y a {n} j", { n: c.joursDepuis })}
                          </Tag>
                        )}
                        {c.enCours ? (
                          // Seule la catégorie lancée se reprend ; ses sous-catégories renvoient à elle.
                          <Button variant={c.enCours.principal ? "primary" : "secondary"} disabled={!c.enCours.principal} onClick={() => navigate(`/inventaires/${c.enCours!.id}`)}>
                            {t("Reprendre")}
                          </Button>
                        ) : (
                          <Button variant="secondary" disabled={opening} onClick={() => nouvelInventaire(DEPOT, [c.id])}>
                            {t("Lancer l'inventaire")}
                          </Button>
                        )}
                      </span>
                    }
                  />
                ))}
              </div>
            )}
          </Section>
        ) : (
          <Section flush aside={!firstLoad && affiches.length > 0 ? `${affiches.length}` : undefined} label={depot ? t("Inventaires du dépôt") : t("Camions inventoriés")}>
            {firstLoad ? (
              <SkeletonList rows={4} />
            ) : !error && affiches.length === 0 ? (
              <EmptyState
                icon={clipboardOutline}
                title={t("Aucun inventaire.")}
                message={
                  depot
                    ? t("Inventoriez le dépôt catégorie par catégorie : c'est plus rapide et plus régulier.")
                    : t("Comptez le stock réel d'un camion et comparez-le aux quantités attendues.")
                }
              />
            ) : (
              parMois.map(([mois, liste]) => (
                <div key={mois} className="rc-inv__mois">
                  <p className="rc-inv__mois-titre rc-cap">{libelleMois(mois)}</p>
                  <div className="rc-list">
                    {liste.map((inv) => {
                      const r = inv.resume;
                      const valide = inv.statut === "VALIDE";
                      return (
                        <Row
                          key={inv.id}
                          onClick={() => navigate(`/inventaires/${inv.id}`)}
                          title={inv.vendeur ? inv.vendeur.nom : inv.libelle ?? t("Tout le dépôt")}
                          meta={
                            valide
                              ? t("Terminé le {date} par {nom} · {n} comptés", { date: formatDateTime(inv.dateValidation ?? inv.createdAt), nom: inv.admin.nom, n: r.nbComptes })
                              : t("Ouvert le {date} · {n}/{total} comptés", { date: formatDateTime(inv.createdAt), n: r.nbComptes, total: r.nbLignes })
                          }
                          trailing={
                            <>
                              {r.manqueUnites > 0 ? (
                                <Money value={r.valeurManque} tone="danger" />
                              ) : r.nbComptes > 0 && r.nbEcarts === 0 ? (
                                <span className="rc-row__note">{t("Conforme")}</span>
                              ) : (
                                <span className="rc-row__note">{tn(r.nbEcarts, "{n} écart", "{n} écarts")}</span>
                              )}
                              <Tag tone={valide ? "positive" : "accent"} dot>
                                {statutInventaireLabel[inv.statut]}
                              </Tag>
                            </>
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </Section>
        )}
        <FabSpacer />

        {/* Dépôt : un seul à inventorier, on l'ouvre (ou on reprend celui en cours) ; camion : on choisit lequel. */}
        <Fab
          icon={addOutline}
          label={opening ? t("Ouverture…") : t("Nouvel inventaire")}
          onClick={() => (depot ? setNouveauDepot({ preselection: [] }) : setSheet("nouveau"))}
        />
      </IonContent>

      <NouvelInventaireSheet
        isOpen={nouveauDepot !== null}
        onDismiss={() => setNouveauDepot(null)}
        categories={suivi}
        preselection={nouveauDepot?.preselection}
        enCours={opening}
        onCommencer={(ids) => nouvelInventaire(DEPOT, ids)}
      />
      <PickerSheet
        isOpen={sheet === "filtre"}
        title={t("Camion")}
        value={filtre ?? ALL}
        onDismiss={() => setSheet(null)}
        onSelect={(v) => {
          setFiltre(v === ALL ? undefined : v);
          setSheet(null);
        }}
        options={[
          { value: ALL, label: t("Tous les camions") },
          ...vendeurs.map((v) => ({ value: v.id, label: t("Camion de {nom}", { nom: v.nom }), meta: v.code, keywords: `${v.nom} ${v.code}` })),
        ]}
      />

      <PickerSheet
        isOpen={sheet === "nouveau"}
        title={t("Inventorier le camion de…")}
        onDismiss={() => setSheet(null)}
        onSelect={nouvelInventaire}
        options={vendeurs.map((v) => ({
          value: v.id,
          label: v.nom,
          meta: enCours.has(v.id) ? t("{code} · inventaire en cours, il sera repris", { code: v.code }) : v.code,
          keywords: `${v.nom} ${v.code}`,
        }))}
      />
    </IonPage>
  );
}
