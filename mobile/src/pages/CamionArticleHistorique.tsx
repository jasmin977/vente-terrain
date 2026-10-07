import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { IonContent, IonPage, IonRefresher, IonRefresherContent, RefresherEventDetail, useIonViewWillEnter } from "@ionic/react";
import { swapVerticalOutline } from "ionicons/icons";
import { getMouvements, getStockCamion } from "../api/stock";
import { listUsers } from "../api/auth";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { effetCamion, type MouvementStock } from "../types/stock";
import ArticleImage from "../components/ArticleImage";
import { formatColis, formatDateTime, joinMeta, pieces } from "../utils/format";
import { sensLabel, sensTone } from "../utils/labels";
import { AppHeader, EmptyState, Group, Notice, PageNotice, Row, Section, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

/** Quantité signée : « +60 », « −8 ». */
function signe(n: number) {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0";
}

/**
 * Cycle de vie d'un article dans un camion : chaque chargement, retour au
 * dépôt, vente, reprise client et ajustement, avec le stock après chaque mouvement.
 */
export default function CamionArticleHistorique() {
  const { vendeurId, articleId } = useParams<{ vendeurId: string; articleId: string }>();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [mouvements, setMouvements] = useState<MouvementStock[]>([]);
  const [stockEnregistre, setStockEnregistre] = useState<number | null>(null);
  const [vendeurNom, setVendeurNom] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!isAdmin || !vendeurId || !articleId) return;
    setError(null);
    try {
      const [m, stock] = await Promise.all([getMouvements(vendeurId, articleId), getStockCamion(vendeurId)]);
      setMouvements(m);
      const ligne = stock.find((s) => s.articleId === articleId);
      setStockEnregistre(ligne ? Number(ligne.quantite) : 0);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger le stock"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, vendeurId, articleId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  useIonViewWillEnter(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers()
      .then((users) => setVendeurNom(users.find((u) => u.id === vendeurId)?.nom ?? null))
      .catch(() => undefined); // le nom du vendeur est secondaire
  }, [isAdmin, vendeurId]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchData();
    e.detail.complete();
  };

  // Stock après chaque mouvement (du plus ancien au plus récent), affiché du plus récent au plus ancien.
  const lignes = useMemo(() => {
    let solde = 0;
    return mouvements
      .map((m) => {
        const effet = effetCamion(m);
        solde += effet;
        return { m, effet, solde };
      })
      .reverse();
  }, [mouvements]);

  const totaux = useMemo(() => {
    const parSens = { CHARGEMENT: 0, RETOUR: 0, VENTE: 0, RETOUR_CLIENT: 0, AJUSTEMENT: 0 };
    for (const m of mouvements) parSens[m.sens] += Number(m.quantite); // AJUSTEMENT : déjà signé
    return parSens;
  }, [mouvements]);

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const article = mouvements[0]?.article;
  const colisage = Number(article?.colisage) || 1;
  const soldeMouvements = lignes[0]?.solde ?? 0;
  const stock = stockEnregistre ?? soldeMouvements;
  const ecart = stockEnregistre === null ? 0 : stockEnregistre - soldeMouvements;

  const resume: { label: string; valeur: number }[] = [
    { label: t("Chargé"), valeur: totaux.CHARGEMENT },
    { label: t("Retourné au dépôt"), valeur: -totaux.RETOUR },
    { label: t("Vendu"), valeur: -totaux.VENTE },
    { label: t("Repris aux clients"), valeur: totaux.RETOUR_CLIENT },
    { label: t("Ajustements"), valeur: totaux.AJUSTEMENT },
  ].filter((r) => r.valeur !== 0);

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={article?.designation ?? t("Historique de l'article")} />

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {error && <PageNotice>{error}</PageNotice>}

        {loading && mouvements.length === 0 ? (
          <Section flush>
            <SkeletonList rows={6} />
          </Section>
        ) : mouvements.length === 0 ? (
          <EmptyState icon={swapVerticalOutline} title={t("Aucun mouvement pour cet article.")} />
        ) : (
          <>
            <div className="rc-media">
              <ArticleImage src={article?.img} alt="" size={64} />
              <div className="rc-summary">
                <p className="rc-summary__label">{t("Camion de {nom} · stock actuel", { nom: vendeurNom ?? "…" })}</p>
                <span className={`rc-qty rc-qty--lg${stock < 0 ? " rc-qty--neg" : ""}`}>
                  <span className="rc-qty__n">{stock}</span> {pieces(stock)}
                  {colisage > 1 && Math.abs(stock) >= colisage && <span className="rc-qty__sub">{formatColis(stock, colisage)}</span>}
                </span>
              </div>
            </div>

            <Section>
              <Group>
                {resume.map((r) => (
                  <Row
                    key={r.label}
                    compact
                    label={r.label}
                    trailing={
                      <span className="rc-qty">
                        <span className="rc-qty__n">{signe(r.valeur)}</span> {pieces(r.valeur)}
                      </span>
                    }
                  />
                ))}
              </Group>
              {ecart !== 0 && (
                <Notice tone="warning">
                  {t(
                    "Le stock enregistré ({s}) diffère de {e} pièces du total des mouvements : des mouvements antérieurs n'ont pas été tracés.",
                    { s: stock, e: signe(ecart) }
                  )}
                </Notice>
              )}
            </Section>

            <Section flush label={t("Cycle de vie")} aside={tn(mouvements.length, "{n} mouvement", "{n} mouvements")}>
              <div className="rc-list">
                {lignes.map(({ m, effet, solde }) => (
                  <Row
                    key={m.id}
                    title={
                      <Tag tone={sensTone[m.sens]} dot>
                        {sensLabel[m.sens]}
                      </Tag>
                    }
                    meta={joinMeta([formatDateTime(m.date), m.reference])}
                    trailing={
                      <span className={`rc-qty${effet < 0 ? " rc-qty--out" : ""}`}>
                        <span className="rc-qty__n">{signe(effet)}</span> {pieces(effet)}
                        <span className="rc-qty__sub">{t("Stock après : {n}", { n: solde })}</span>
                      </span>
                    }
                  />
                ))}
              </div>
            </Section>
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
