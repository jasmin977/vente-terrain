import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { IonContent, IonPage, IonRefresher, IonRefresherContent, RefresherEventDetail, useIonViewWillEnter } from "@ionic/react";
import {
  addOutline,
  carOutline,
  chevronBackOutline,
  chevronForwardOutline,
  cubeOutline,
  downloadOutline,
  personOutline,
  receiptOutline,
} from "ionicons/icons";
import {
  getStockCamion,
  getStockDepot,
  getVentesParArticle,
  listChargements,
  listEntreesDepot,
  type PlageDates,
} from "../api/stock";
import { listUsers } from "../api/auth";
import { listArticles } from "../api/articles";
import type { Article } from "../types/article";
import type {
  ChargementResume,
  EntreeDepotResume,
  StockCamionItem,
  StockDepotItem,
  VentesParArticle,
} from "../types/stock";
import type { UserSummary } from "../types/auth";
import { useAuth } from "../auth/AuthContext";
import ArticleImage from "../components/ArticleImage";
import { ApiError } from "../api/client";
import { formatColis, formatDateTime, pieces, joinMeta } from "../utils/format";
import { articleCorrespond, articleParCode } from "../utils/articleSearch";
import DepotDashboard from "./DepotDashboard";
import {
  AccountButton,
  AppHeader,
  Button,
  EmptyState,
  Fab,
  FabSpacer,
  FilterChip,
  IconButton,
  Money,
  PageNotice,
  PickerSheet,
  Row,
  SearchField,
  Section,
  Segmented,
  SkeletonList,
  Tag,
} from "../ui";
import { getLocale, t, tn } from "../i18n";

// « articles » : le catalogue (prix, fiches), rangé ici pour l'admin.
type Lieu = "depot" | "camion" | "articles";
// Vocabulaire du dépôt : bons d'entrée (réceptions) et bons de sortie
// (chargements des camions, tous vendeurs).
type VueDepot = "stock" | "entrees" | "sorties" | "retours";
type VueCamion = "stock" | "chargements" | "retours";

/** 1er jour du mois décalé de `decalage` mois par rapport au mois en cours. */
function premierDuMois(decalage: number) {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + decalage, 1);
}

/** Bornes d'un mois dans le fuseau du téléphone (instants ISO). */
function plageMois(decalage: number): PlageDates {
  const debut = premierDuMois(decalage);
  const fin = new Date(debut.getFullYear(), debut.getMonth() + 1, 1);
  fin.setMilliseconds(-1);
  return { dateFrom: debut.toISOString(), dateTo: fin.toISOString() };
}

/** Quantité en pièces + équivalent colis ; négatif mis en évidence. */
function Quantity({ value, colisage }: { value: number; colisage: number }) {
  return (
    <span className={`rc-qty${value < 0 ? " rc-qty--neg" : ""}`}>
      <span className="rc-qty__n">{value}</span> {pieces(value)}
      {colisage > 1 && Math.abs(value) >= colisage && <span className="rc-qty__sub">{formatColis(value, colisage)}</span>}
    </span>
  );
}

/** Total d'un document de l'historique (pièces + nombre d'articles). */
function TotalDocument({ totalPieces, nbLignes }: { totalPieces: number; nbLignes: number }) {
  return (
    <span className="rc-qty">
      <span className="rc-qty__n">{totalPieces}</span> {pieces(totalPieces)}
      <span className="rc-qty__sub">{tn(nbLignes, "{n} article", "{n} articles")}</span>
    </span>
  );
}

export default function Stock() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [lieu, setLieu] = useState<Lieu>("depot");
  const [vueDepot, setVueDepot] = useState<VueDepot>("stock");
  const [vueCamion, setVueCamion] = useState<VueCamion>("stock");
  /** Chargements et mouvements du camion : 0 = mois en cours, -1 = mois précédent… */
  const [decalageMois, setDecalageMois] = useState(0);
  const [query, setQuery] = useState("");
  const [vendeurs, setVendeurs] = useState<UserSummary[]>([]);
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [vendeurSheet, setVendeurSheet] = useState(false);
  const [depot, setDepot] = useState<StockDepotItem[]>([]);
  const [ventes, setVentes] = useState<VentesParArticle | null>(null);
  const [entrees, setEntrees] = useState<EntreeDepotResume[]>([]);
  const [stock, setStock] = useState<StockCamionItem[]>([]);
  const [chargements, setChargements] = useState<ChargementResume[]>([]);
  const [sorties, setSorties] = useState<ChargementResume[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    listUsers()
      .then((list) => {
        const vendeursSeuls = list.filter((u) => u.role === "VENDEUR" && u.actif);
        setVendeurs(vendeursSeuls);
        setVendeurId((cur) => cur ?? vendeursSeuls[0]?.id);
      })
      .catch(() => undefined); // la liste des vendeurs est secondaire
  }, [isAdmin]);

  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setError(null);
    try {
      if (lieu === "articles") {
        setArticles(await listArticles());
      } else if (lieu === "depot") {
        if (vueDepot === "stock") {
          const [d, v] = await Promise.all([getStockDepot(), getVentesParArticle(30).catch(() => null)]);
          setDepot(d);
          setVentes(v);
        } else if (vueDepot === "entrees") setEntrees(await listEntreesDepot(plageMois(decalageMois)));
        else {
          // Bons de sortie = chargements ; bons de retour = retours camion → dépôt (tous camions).
          const sens = vueDepot === "sorties" ? "CHARGEMENT" : "RETOUR";
          setSorties((await listChargements(undefined, plageMois(decalageMois))).filter((c) => c.sens === sens));
        }
      } else if (vendeurId) {
        if (vueCamion === "stock") setStock(await getStockCamion(vendeurId));
        else if (vueCamion === "chargements" || vueCamion === "retours") {
          const sens = vueCamion === "chargements" ? "CHARGEMENT" : "RETOUR";
          setChargements((await listChargements(vendeurId, plageMois(decalageMois))).filter((c) => c.sens === sens));
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger le stock"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, lieu, vueDepot, vueCamion, vendeurId, decalageMois]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  // Ionic garde la page montée : on recharge à chaque retour sur l'écran
  // (après une entrée, un chargement, une suppression…) pour ne pas afficher de données périmées.
  useIonViewWillEnter(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchData();
    e.detail.complete();
  };

  const q = query.trim();
  const depotFiltre = useMemo(() => depot.filter((d) => articleCorrespond(d.article, q)), [depot, q]);
  const stockFiltre = useMemo(() => stock.filter((s) => articleCorrespond(s.article, q)), [stock, q]);
  const articlesFiltres = useMemo(() => articles.filter((a) => articleCorrespond(a, q)), [articles, q]);

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const vendeur = vendeurs.find((v) => v.id === vendeurId);
  const camionSansVendeur = lieu === "camion" && !vendeurId;
  // La recherche produit ne concerne que les listes d'articles, pas l'historique.
  const vueProduits =
    lieu === "articles" ? true : lieu === "depot" ? vueDepot === "stock" : vueCamion === "stock";

  // Catalogue : un code-barres reconnu ouvre directement la fiche article.
  const handleScan = (code: string) => {
    const trouve = lieu === "articles" ? articleParCode(articles, code) : undefined;
    if (trouve) navigate(`/articles/${trouve.id}`);
    else setQuery(code);
  };

  const contenuArticles = () => (
    <Section flush aside={articles.length > 0 ? tn(articles.length, "{n} article", "{n} articles") : undefined}>
      {articlesFiltres.length === 0 ? (
        <EmptyState
          icon={cubeOutline}
          title={t("Aucun article trouvé.")}
          message={q ? t("Essayez une autre désignation, un code ou un code-barres.") : undefined}
        />
      ) : (
        <div className="rc-list">
          {articlesFiltres.map((a) => (
            <Row
              key={a.id}
              thumb
              chevron
              onClick={() => navigate(`/articles/${a.id}`)}
              leading={<ArticleImage src={a.img} alt="" />}
              title={a.designation}
              meta={joinMeta([a.code, a.unit, a.marque])}
              trailing={<Money value={a.prixVente} />}
            />
          ))}
        </div>
      )}
    </Section>
  );

  const contenuDepot = () => {
    if (vueDepot === "entrees") {
      return (
        <Section flush aside={entrees.length > 0 ? tn(entrees.length, "{n} bon d'entrée", "{n} bons d'entrée") : undefined}>
          {entrees.length === 0 ? (
            <EmptyState icon={receiptOutline} title={t("Aucun bon d'entrée ce mois-ci.")} message={t("Les réceptions au dépôt apparaîtront ici.")} />
          ) : (
            <div className="rc-list">
              {entrees.map((e) => (
                <Row
                  key={e.id}
                  muted={Boolean(e.deletedAt)}
                  chevron
                  onClick={() => navigate(`/stock/entrees/${e.id}`)}
                  title={e.reference || t("Bon d'entrée sans référence")}
                  meta={joinMeta([formatDateTime(e.date), e.admin?.nom])}
                  trailing={
                    <>
                      <TotalDocument totalPieces={e.totalPieces} nbLignes={e.nbLignes} />
                      {e.deletedAt && <Tag tone="danger">{t("Supprimée")}</Tag>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </Section>
      );
    }
    if (vueDepot === "sorties" || vueDepot === "retours") {
      const retours = vueDepot === "retours";
      return (
        <Section
          flush
          aside={
            sorties.length > 0
              ? retours
                ? tn(sorties.length, "{n} bon de retour", "{n} bons de retour")
                : tn(sorties.length, "{n} bon de sortie", "{n} bons de sortie")
              : undefined
          }
        >
          {sorties.length === 0 ? (
            retours ? (
              <EmptyState icon={carOutline} title={t("Aucun bon de retour ce mois-ci.")} message={t("Les retours des camions au dépôt apparaîtront ici.")} />
            ) : (
              <EmptyState icon={carOutline} title={t("Aucun bon de sortie ce mois-ci.")} message={t("Les chargements des camions apparaîtront ici.")} />
            )
          ) : (
            <div className="rc-list">
              {sorties.map((c) => (
                <Row
                  key={c.id}
                  muted={Boolean(c.deletedAt)}
                  chevron
                  onClick={() => navigate(`/stock/chargements/${c.id}`)}
                  title={c.reference || (retours ? t("Bon de retour sans référence") : t("Bon de sortie sans référence"))}
                  meta={joinMeta([formatDateTime(c.date), t("Camion de {nom}", { nom: c.vendeur.nom })])}
                  trailing={
                    <>
                      <TotalDocument totalPieces={c.totalPieces} nbLignes={c.nbLignes} />
                      {c.deletedAt && <Tag tone="danger">{t("Supprimé")}</Tag>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </Section>
      );
    }
    const total = depot.reduce((s, d) => s + d.quantite, 0);
    return (
      <>
        {/* Tableau de bord masqué pendant une recherche : les résultats d'abord. */}
        {!q && depot.length > 0 && <DepotDashboard depot={depot} ventes={ventes} />}
        <Section
          flush
          label={q ? undefined : t("Articles")}
          aside={t("{articles} · {q} au dépôt", {
            articles: tn(depot.length, "{n} article", "{n} articles"),
            q: `${total} ${pieces(total)}`,
          })}
        >
          {depotFiltre.length === 0 ? (
            <EmptyState icon={cubeOutline} title={t("Aucun article.")} message={q ? t("Essayez une autre recherche.") : undefined} />
          ) : (
            <div className="rc-list">
              {depotFiltre.map((d) => (
                <Row
                  key={d.articleId}
                  thumb
                  muted={d.quantite === 0}
                  leading={<ArticleImage src={d.article.img} alt="" />}
                  title={d.article.designation}
                  meta={joinMeta([d.article.code, d.article.unit])}
                  trailing={<Quantity value={d.quantite} colisage={Number(d.article.colisage)} />}
                />
              ))}
            </div>
          )}
        </Section>
      </>
    );
  };

  const contenuCamion = () => {
    if (vueCamion === "chargements" || vueCamion === "retours") {
      const retours = vueCamion === "retours";
      return (
        <Section
          flush
          aside={
            chargements.length > 0
              ? retours
                ? tn(chargements.length, "{n} bon de retour", "{n} bons de retour")
                : tn(chargements.length, "{n} bon de chargement", "{n} bons de chargement")
              : undefined
          }
        >
          {chargements.length === 0 ? (
            retours ? (
              <EmptyState icon={carOutline} title={t("Aucun retour ce mois-ci.")} message={t("Les retours de ce camion au dépôt apparaîtront ici.")} />
            ) : (
              <EmptyState icon={carOutline} title={t("Aucun chargement ce mois-ci.")} message={t("Les chargements de ce camion apparaîtront ici.")} />
            )
          ) : (
            <div className="rc-list">
              {chargements.map((c) => (
                <Row
                  key={c.id}
                  muted={Boolean(c.deletedAt)}
                  chevron
                  onClick={() => navigate(`/stock/chargements/${c.id}`)}
                  title={c.reference || (retours ? t("Bon de retour sans référence") : t("Bon de chargement sans référence"))}
                  meta={formatDateTime(c.date)}
                  trailing={
                    <>
                      <TotalDocument totalPieces={c.totalPieces} nbLignes={c.nbLignes} />
                      {c.deletedAt && <Tag tone="danger">{t("Supprimé")}</Tag>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </Section>
      );
    }
    const total = stock.reduce((s, i) => s + Number(i.quantite), 0);
    return (
      <Section
        flush
        aside={
          stock.length > 0
            ? t("{articles} · {q} (théorique)", {
                articles: tn(stock.length, "{n} article", "{n} articles"),
                q: `${total} ${pieces(total)}`,
              })
            : undefined
        }
      >
        {stockFiltre.length === 0 ? (
          <EmptyState
            icon={carOutline}
            title={q ? t("Aucun article.") : t("Camion vide.")}
            message={q ? t("Essayez une autre recherche.") : t("Chargez ce camion depuis le dépôt.")}
          />
        ) : (
          <div className="rc-list">
            {stockFiltre.map((item) => {
              const qte = Number(item.quantite);
              return (
                <Row
                  key={item.id}
                  thumb
                  muted={qte === 0}
                  leading={<ArticleImage src={item.article.img} alt="" />}
                  title={item.article.designation}
                  meta={joinMeta([item.article.code, item.article.unit])}
                  trailing={<Quantity value={qte} colisage={Number(item.article.colisage)} />}
                />
              );
            })}
          </div>
        )}
      </Section>
    );
  };

  return (
    <IonPage>
      <AppHeader large title={t("Stock")} actions={<AccountButton />}>
        <Segmented
          label={t("Lieu de stock")}
          value={lieu}
          onChange={(v) => {
            setLieu(v);
            setQuery("");
          }}
          options={[
            { value: "depot", label: t("Dépôt") },
            { value: "camion", label: t("Camion") },
            { value: "articles", label: t("Articles") },
          ]}
        />
        {lieu === "camion" && (
          <div>
            <FilterChip
              label={vendeur ? `${vendeur.nom} (${vendeur.code})` : t("Choisir un vendeur")}
              active={Boolean(vendeur)}
              ariaLabel={t("Camion du vendeur : {nom}", { nom: vendeur ? vendeur.nom : t("aucun") })}
              onOpen={() => setVendeurSheet(true)}
            />
          </div>
        )}
        {vueProduits && <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, code…")} />}
      </AppHeader>

      <IonContent>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {error && (
          <PageNotice
            actionLabel={t("Réessayer")}
            onAction={() => {
              setLoading(true);
              fetchData();
            }}
          >
            {error}
          </PageNotice>
        )}

        {!camionSansVendeur && lieu !== "articles" && (
          <div className="rc-period">
            {lieu === "depot" ? (
              <Segmented
                label={t("Affichage du dépôt")}
                value={vueDepot}
                onChange={setVueDepot}
                wrap
                columns={2}
                options={[
                  { value: "stock", label: t("Stock") },
                  { value: "entrees", label: t("Bons d'entrée") },
                  { value: "sorties", label: t("Bons de sortie") },
                  { value: "retours", label: t("Bons de retour") },
                ]}
              />
            ) : (
              <Segmented
                label={t("Affichage du camion")}
                value={vueCamion}
                onChange={setVueCamion}
                options={[
                  { value: "stock", label: t("Stock") },
                  { value: "chargements", label: t("Chargements") },
                  { value: "retours", label: t("Retours") },
                ]}
              />
            )}
          </div>
        )}

        {/* Chargements et mouvements du camion : un mois à la fois. */}
        {((lieu === "camion" && !camionSansVendeur && vueCamion !== "stock") || (lieu === "depot" && vueDepot !== "stock")) && (
          <div className="rc-period">
            <div className="rc-daystep">
              <IconButton
                icon={chevronBackOutline}
                className="rc-flip"
                label={t("Mois précédent")}
                variant="filled"
                onClick={() => setDecalageMois((m) => m - 1)}
              />
              <p className="rc-daystep__label rc-cap" aria-live="polite">
                {premierDuMois(decalageMois).toLocaleDateString(getLocale(), { month: "long", year: "numeric" })}
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
          </div>
        )}

        {camionSansVendeur ? (
          <EmptyState
            icon={personOutline}
            title={t("Sélectionnez un vendeur.")}
            message={t("Chaque camion a son propre stock.")}
            action={
              <Button variant="secondary" onClick={() => setVendeurSheet(true)}>
                {t("Choisir un vendeur")}
              </Button>
            }
          />
        ) : loading ? (
          <Section flush>
            <SkeletonList thumb={vueProduits} />
          </Section>
        ) : error ? null : lieu === "articles" ? (
          contenuArticles()
        ) : lieu === "depot" ? (
          contenuDepot()
        ) : (
          contenuCamion()
        )}
        <FabSpacer />

        {lieu === "articles" ? (
          <Fab icon={addOutline} label={t("Nouvel article")} onClick={() => navigate("/articles/new")} />
        ) : lieu === "depot" ? (
          vueDepot === "sorties" ? (
            <Fab icon={addOutline} label={t("Bon de chargement")} onClick={() => navigate("/stock/chargement")} />
          ) : vueDepot === "retours" ? (
            <Fab icon={addOutline} label={t("Bon de retour")} onClick={() => navigate("/stock/retour")} />
          ) : (
            <Fab icon={downloadOutline} label={t("Bon d'entrée")} onClick={() => navigate("/stock/entree")} />
          )
        ) : vueCamion === "retours" ? (
          <Fab icon={addOutline} label={t("Bon de retour")} onClick={() => navigate("/stock/retour", { state: { vendeurId } })} />
        ) : (
          <Fab icon={addOutline} label={t("Bon de chargement")} onClick={() => navigate("/stock/chargement", { state: { vendeurId } })} />
        )}
      </IonContent>

      <PickerSheet
        isOpen={vendeurSheet}
        title={t("Vendeur")}
        value={vendeurId}
        onDismiss={() => setVendeurSheet(false)}
        onSelect={(v) => {
          setVendeurId(v);
          setVendeurSheet(false);
        }}
        options={vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code }))}
      />
    </IonPage>
  );
}
