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
import { listInventaires, ouvrirInventaire } from "../api/inventaires";
import { listUsers } from "../api/auth";
import type { InventaireResume } from "../types/inventaire";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { formatDateTime } from "../utils/format";
import { statutInventaireLabel } from "../utils/labels";
import {
  AccountButton,
  AppHeader,
  EmptyState,
  Fab,
  FabSpacer,
  FilterChip,
  Money,
  PageNotice,
  PickerSheet,
  Row,
  Section,
  SkeletonList,
  Tag,
} from "../ui";
import { t, tn } from "../i18n";

const ALL = "__all__";

export default function Inventaires() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [inventaires, setInventaires] = useState<InventaireResume[]>([]);
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [filtre, setFiltre] = useState<string | undefined>(undefined);
  const [sheet, setSheet] = useState<"filtre" | "nouveau" | null>(null);
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setInventaires(await listInventaires(filtre));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les inventaires"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, filtre]);

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

  const nouvelInventaire = async (vendeurId: string) => {
    setSheet(null);
    setOpening(true);
    setError(null);
    try {
      const inv = await ouvrirInventaire(vendeurId);
      navigate(`/inventaires/${inv.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible d'ouvrir l'inventaire"));
    } finally {
      setOpening(false);
    }
  };

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const vendeurFiltre = vendeurs.find((v) => v.id === filtre);
  const enCours = new Set(inventaires.filter((i) => i.statut === "EN_COURS").map((i) => i.vendeurId));
  const firstLoad = loading && inventaires.length === 0;

  return (
    <IonPage>
      <AppHeader large title={t("Inventaires")} actions={<AccountButton />}>
        <div>
          <FilterChip
            label={vendeurFiltre ? vendeurFiltre.nom : t("Tous les vendeurs")}
            active={Boolean(vendeurFiltre)}
            ariaLabel={t("Filtrer par vendeur : {nom}", { nom: vendeurFiltre ? vendeurFiltre.nom : t("tous les vendeurs") })}
            onOpen={() => setSheet("filtre")}
          />
        </div>
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

        <Section flush aside={!firstLoad && inventaires.length > 0 ? `${inventaires.length}` : undefined} label={t("Camions inventoriés")}>
          {firstLoad ? (
            <SkeletonList rows={4} />
          ) : !error && inventaires.length === 0 ? (
            <EmptyState
              icon={clipboardOutline}
              title={t("Aucun inventaire.")}
              message={t("Comptez le stock réel d'un camion et comparez-le aux quantités attendues.")}
            />
          ) : (
            inventaires.length > 0 && (
              <div className="rc-list">
                {inventaires.map((inv) => {
                  const r = inv.resume;
                  const valide = inv.statut === "VALIDE";
                  return (
                    <Row
                      key={inv.id}
                      onClick={() => navigate(`/inventaires/${inv.id}`)}
                      title={inv.vendeur.nom}
                      meta={
                        valide
                          ? t("Validé le {date} · {n} comptés", { date: formatDateTime(inv.dateValidation ?? inv.createdAt), n: r.nbComptes })
                          : t("Ouvert le {date} · {n}/{total} comptés", { date: formatDateTime(inv.createdAt), n: r.nbComptes, total: r.nbLignes })
                      }
                      trailing={
                        <>
                          {r.manqueUnites > 0 ? (
                            <Money value={r.valeurManque} tone="danger" />
                          ) : r.nbComptes > 0 && r.nbEcarts === 0 ? (
                            <span className="rc-row__note">{t("Conforme")}</span>
                          ) : (
                            <span className="rc-row__note">
                              {tn(r.nbEcarts, "{n} écart", "{n} écarts")}
                            </span>
                          )}
                          <Tag tone={valide ? "neutral" : "accent"} dot={!valide}>
                            {statutInventaireLabel[inv.statut]}
                          </Tag>
                        </>
                      }
                    />
                  );
                })}
              </div>
            )
          )}
        </Section>
        <FabSpacer />

        <Fab icon={addOutline} label={opening ? t("Ouverture…") : t("Nouvel inventaire")} onClick={() => setSheet("nouveau")} />
      </IonContent>

      <PickerSheet
        isOpen={sheet === "filtre"}
        title={t("Vendeur")}
        value={filtre ?? ALL}
        onDismiss={() => setSheet(null)}
        onSelect={(v) => {
          setFiltre(v === ALL ? undefined : v);
          setSheet(null);
        }}
        options={[
          { value: ALL, label: t("Tous les vendeurs") },
          ...vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code })),
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
          keywords: v.code,
        }))}
      />
    </IonPage>
  );
}
