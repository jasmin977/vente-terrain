import { joinMeta } from "../utils/format";
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
import { personAddOutline, peopleOutline } from "ionicons/icons";
import { listUsers } from "../api/auth";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { initials } from "../utils/labels";
import { texteCorrespond } from "../utils/articleSearch";
import { AppHeader, EmptyState, Fab, FabSpacer, PageNotice, Row, SearchField, Section, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

/** Comptes vendeurs (admin) : actifs d'abord, désactivés grisés. */
export default function Vendeurs() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les vendeurs"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useIonViewWillEnter(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchData();
    e.detail.complete();
  };

  const vendeurs = useMemo(
    () =>
      users
        .filter((u) => u.role === "VENDEUR")
        .filter((u) => texteCorrespond(`${u.nom} ${u.code} ${u.telephone ?? ""} ${u.email ?? ""}`, query))
        .sort((a, b) => Number(b.actif) - Number(a.actif) || a.nom.localeCompare(b.nom, "fr")),
    [users, query]
  );

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const nbActifs = users.filter((u) => u.role === "VENDEUR" && u.actif).length;

  return (
    <IonPage>
      <AppHeader backHref="/factures" title={t("Vendeurs")}>
        <SearchField value={query} onChange={setQuery} placeholder={t("Nom, code, téléphone…")} />
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

        <Section flush aside={!loading ? tn(nbActifs, "{n} actif", "{n} actifs") : undefined}>
          {loading && users.length === 0 ? (
            <SkeletonList rows={4} />
          ) : vendeurs.length === 0 ? (
            <EmptyState
              icon={peopleOutline}
              title={query ? t("Aucun vendeur trouvé.") : t("Aucun vendeur.")}
              message={query ? undefined : t("Créez un compte pour chaque vendeur : il se connecte avec son code et son mot de passe.")}
            />
          ) : (
            <div className="rc-list">
              {vendeurs.map((v) => (
                <Row
                  key={v.id}
                  muted={!v.actif}
                  chevron
                  onClick={() => navigate(`/vendeurs/${v.id}`)}
                  leading={
                    <span className={`rc-avatar${v.actif ? "" : " rc-avatar--off"}`} aria-hidden="true">
                      {initials(v.nom)}
                    </span>
                  }
                  title={v.nom}
                  meta={joinMeta([t("Code {code}", { code: v.code }), v.telephone])}
                  trailing={v.actif ? <Tag tone="positive" dot>{t("Actif")}</Tag> : <Tag>{t("Désactivé")}</Tag>}
                />
              ))}
            </div>
          )}
        </Section>
        <FabSpacer />

        <Fab icon={personAddOutline} label={t("Nouveau vendeur")} onClick={() => navigate("/vendeurs/new")} />
      </IonContent>
    </IonPage>
  );
}
