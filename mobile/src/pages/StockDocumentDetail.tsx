import { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage, useIonRouter } from "@ionic/react";
import { printOutline, trashOutline } from "ionicons/icons";
import { getChargement, getEntreeDepot, supprimerChargement, supprimerEntreeDepot } from "../api/stock";
import type { Article } from "../types/article";
import type { Suppression } from "../types/stock";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import TelechargerA4Button from "../components/TelechargerA4Button";
import { formatColis, formatDateTime, pieces, joinMeta } from "../utils/format";
import { imprimerBonA4, imprimerBonImprimante, numeroBon, type BonA4 } from "../utils/bonPdf";
import { AppHeader, Button, Group, Notice, PageNotice, Row, Section, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

type Kind = "entree" | "chargement";

/** Vue commune d'un bon d'entrée (dépôt) ou d'un chargement / retour camion. */
interface Document {
  titre: string;
  sousTitre: string;
  date: string;
  deletedAt?: string | null;
  totalPieces: number;
  lignes: { id: string; pieces: number; article: Article }[];
  suppression: Suppression;
  /** Effet sur le stock, expliqué avant confirmation. */
  effet: string;
  libelleSuppression: string;
  /** Données du bon imprimé en A4. */
  bon: BonA4;
}

async function charger(kind: Kind, id: string): Promise<Document> {
  if (kind === "entree") {
    const e = await getEntreeDepot(id);
    return {
      titre: e.reference || t("Bon d'entrée sans référence"),
      sousTitre: `${t("Bon d'entrée")}${e.admin ? ` · ${e.admin.nom}` : ""}`,
      date: e.date,
      deletedAt: e.deletedAt,
      totalPieces: e.totalPieces,
      lignes: e.lignes.map((l) => ({ id: l.id, pieces: Number(l.quantite), article: l.article })),
      suppression: e.suppression,
      effet: t("Les {n} pièces reçues seront retirées du stock du dépôt.", { n: e.totalPieces }),
      libelleSuppression: t("Supprimer ce bon d'entrée"),
      bon: {
        type: "ENTREE",
        numero: numeroBon(e.reference, e.date),
        date: e.date,
        lignes: e.lignes.map((l) => ({ article: l.article, pieces: Number(l.quantite) })),
      },
    };
  }
  const c = await getChargement(id);
  const chargement = c.sens === "CHARGEMENT";
  return {
    titre: c.reference || (chargement ? t("Bon de chargement") : t("Bon de retour")),
    sousTitre: joinMeta([
      chargement ? t("Bon de chargement") : t("Bon de retour"),
      t("Camion de {nom}", { nom: c.vendeur.nom }),
      chargement ? t("dépôt → camion") : t("camion → dépôt"),
    ]),
    date: c.date,
    deletedAt: c.deletedAt,
    totalPieces: c.totalPieces,
    lignes: c.lignes.map((l) => ({ id: l.id, pieces: l.pieces, article: l.article })),
    suppression: c.suppression,
    effet: chargement
      ? t("Les {n} pièces reviendront au dépôt et seront retirées du camion de {nom}.", { n: c.totalPieces, nom: c.vendeur.nom })
      : t("Les {n} pièces repartiront du dépôt vers le camion de {nom}.", { n: c.totalPieces, nom: c.vendeur.nom }),
    libelleSuppression: chargement ? t("Supprimer ce bon de chargement") : t("Supprimer ce bon de retour"),
    bon: {
      type: chargement ? "SORTIE" : "RETOUR",
      numero: numeroBon(c.reference, c.date),
      date: c.date,
      vendeur: c.vendeur,
      lignes: c.lignes.map((l) => ({ article: l.article, pieces: l.pieces })),
    },
  };
}

export default function StockDocumentDetail({ kind }: { kind: Kind }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const router = useIonRouter();
  const { user } = useAuth();
  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [impression, setImpression] = useState(false);
  const [impressionA4, setImpressionA4] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const recharger = useCallback(async () => {
    try {
      setDoc(await charger(kind, id!));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Document introuvable"));
    } finally {
      setLoading(false);
    }
  }, [kind, id]);

  useEffect(() => {
    recharger();
  }, [recharger]);

  const supprimer = async () => {
    setDeleting(true);
    setError(null);
    try {
      if (kind === "entree") await supprimerEntreeDepot(id!);
      else await supprimerChargement(id!);
      // Retour arrière (et non un remplacement d'URL) : l'écran Stock se recharge
      // à l'entrée et affiche le document comme supprimé.
      if (router.canGoBack()) router.goBack();
      else navigate("/stock", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la suppression"));
      setDeleting(false);
      recharger();
    }
  };

  const imprimer = async () => {
    if (!doc) return;
    setImpression(true);
    setError(null);
    try {
      await imprimerBonA4(doc.bon);
    } catch (err) {
      // Partage annulé par l'utilisateur : pas une erreur.
      const message = err instanceof Error ? err.message : String(err);
      if (!/cancel/i.test(message)) setError(t("Impossible de générer le bon : {e}", { e: message }));
    } finally {
      setImpression(false);
    }
  };

  // Imprimante classique (A4) : écran « Imprimer » d'Android.
  const imprimerA4 = async () => {
    if (!doc) return;
    setImpressionA4(true);
    setError(null);
    try {
      await imprimerBonImprimante(doc.bon);
    } catch (err) {
      setError(t("Impression impossible : {e}", { e: err instanceof Error ? err.message : String(err) }));
    } finally {
      setImpressionA4(false);
    }
  };

  if (user?.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const supprime = Boolean(doc?.deletedAt);

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={doc?.titre ?? (kind === "entree" ? t("Bon d'entrée") : t("Bon de chargement"))}
        eyebrow={doc ? formatDateTime(doc.date) : undefined}
        actions={
          doc && (
            <>
              <TelechargerA4Button label={t("Télécharger le bon en A4")} enCours={impression} onClick={imprimer} />
              <TelechargerA4Button icon={printOutline} label={t("Imprimer en A4 (imprimante)")} enCours={impressionA4} onClick={imprimerA4} />
            </>
          )
        }
      />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}
        {loading && <SkeletonList rows={4} thumb />}

        {doc && (
          <>
            <div className="rc-summary">
              <p className="rc-summary__label">{doc.sousTitre}</p>
              <span className="rc-expect__value">
                {doc.totalPieces} <small>{pieces(doc.totalPieces)}</small>
              </span>
              <div className="rc-tags">
                {supprime ? <Tag tone="danger">{t("Supprimé")}</Tag> : <Tag tone="ink">{t("Enregistré")}</Tag>}
                <Tag>
                  {tn(doc.lignes.length, "{n} article", "{n} articles")}
                </Tag>
              </div>
            </div>

            <Section label={t("Articles")}>
              <Group>
                {doc.lignes.map((l) => {
                  const c = Number(l.article.colisage) || 1;
                  return (
                    <Row
                      key={l.id}
                      thumb
                      muted={supprime}
                      leading={<ArticleImage src={l.article.img} alt="" />}
                      title={l.article.designation}
                      meta={joinMeta([l.article.code, l.article.unit])}
                      trailing={
                        <span className="rc-qty">
                          <span className="rc-qty__n">{l.pieces}</span> {pieces(l.pieces)}
                          {c > 1 && l.pieces >= c && <span className="rc-qty__sub">{formatColis(l.pieces, c)}</span>}
                        </span>
                      }
                    />
                  );
                })}
              </Group>
            </Section>

            <Section>
              {supprime ? (
                <Notice tone="info">
                  {t("Supprimé le {date} : le stock a été rétabli. Le document reste visible pour l'historique.", {
                    date: formatDateTime(doc.deletedAt!),
                  })}
                </Notice>
              ) : doc.suppression.possible ? (
                <div className="rc-fields">
                  {doc.suppression.avertissement && <Notice tone="warning">{doc.suppression.avertissement}</Notice>}
                  <Button variant="danger" block icon={trashOutline} loading={deleting} onClick={() => setConfirm(true)}>
                    {doc.libelleSuppression}
                  </Button>
                </div>
              ) : (
                <Notice tone="info">{doc.suppression.raison}</Notice>
              )}
            </Section>
          </>
        )}

        <IonAlert
          isOpen={confirm}
          onDidDismiss={() => setConfirm(false)}
          header={`${doc?.libelleSuppression ?? t("Supprimer")} ?`}
          message={`${doc?.effet ?? ""}${doc?.suppression.avertissement ? ` ${doc.suppression.avertissement}` : ""} ${t("Le document restera visible dans l'historique, marqué supprimé.")}`}
          buttons={[
            { text: t("Annuler"), role: "cancel" },
            { text: t("Supprimer"), role: "destructive", handler: supprimer },
          ]}
        />
      </IonContent>
    </IonPage>
  );
}
