import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { IonContent, IonPage, IonRefresher, IonRefresherContent, RefresherEventDetail, useIonViewWillEnter } from "@ionic/react";
import {
  addOutline,
  cloudUploadOutline,
  imageOutline,
  folderOpenOutline,
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
import { prixTTC } from "../utils/tarifs";
import TriArticlesButton from "../components/TriArticlesButton";
import { CRITERES_STOCK, trierArticles, trierStock, useTriArticles } from "../utils/triArticles";
import { ApiError } from "../api/client";
import { formatColis, formatDateTime, pieces, joinMeta } from "../utils/format";
import { articleCorrespond, articleParCode } from "../utils/articleSearch";
import FiltreCategorie from "../components/FiltreCategorie";
import { filtrerParCategorie } from "../utils/categories";
import { useCategories } from "../utils/useCategories";
import DepotDashboard from "./DepotDashboard";
import ImportArticlesSheet from "../components/ImportArticlesSheet";
import TrouverPhotosSheet from "../components/TrouverPhotosSheet";
import { useVueUrl } from "../utils/useVueUrl";
import {
  AccountButton,
  AppHeader,
  Button,
  CellulesTableau,
  EnteteTableau,
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
  ChargerPlus,
  useListeProgressive,
  BoutonHaut,
  useRetourEnHaut,
  useEcranLarge,
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
  // Web : Dépôt / Camion / Articles se choisissent dans le menu latéral (?lieu=…), pas par onglets.
  const web = useEcranLarge();
  useVueUrl("/stock", "lieu", ["depot", "camion", "articles"] as const, (v) => {
    setLieu(v);
    setQuery("");
  });
  const [vueDepot, setVueDepot] = useState<VueDepot>("stock");
  const [vueCamion, setVueCamion] = useState<VueCamion>("stock");
  // Web : Stock / Bons d'entrée, de sortie, de retour (dépôt) et Stock / Chargements / Retours (camion) se choisissent aussi dans le menu (?vue=…).
  const { search: adresse } = useLocation();
  useVueUrl("/stock", "vue", ["stock", "entrees", "sorties", "retours", "chargements"] as const, (v) => {
    if (new URLSearchParams(adresse).get("lieu") === "camion") {
      if (v === "stock" || v === "chargements" || v === "retours") setVueCamion(v);
    } else if (v !== "chargements") setVueDepot(v);
  });
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
  const [importOuvert, setImportOuvert] = useState(false);
  const [photosOuvert, setPhotosOuvert] = useState(false);
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
  const [triDepot, setTriDepot] = useTriArticles("depot");
  const [triCamion, setTriCamion] = useTriArticles("camion");
  const haut = useRetourEnHaut();
  // Filtre par catégorie, commun aux listes d'articles de l'écran.
  const { categories, recharger: rechargerCategories } = useCategories();
  const [categorie, setCategorie] = useState<string | undefined>(undefined);
  const depotFiltre = useMemo(
    () => trierStock(filtrerParCategorie(depot.filter((d) => articleCorrespond(d.article, q)), categories, categorie, (d) => d.article), triDepot),
    [depot, q, categories, categorie, triDepot]
  );
  const stockFiltre = useMemo(
    () => trierStock(filtrerParCategorie(stock.filter((s) => articleCorrespond(s.article, q)), categories, categorie, (s) => s.article), triCamion),
    [stock, q, categories, categorie, triCamion]
  );
  const [triArticles, setTriArticles] = useTriArticles();
  const articlesFiltres = useMemo(
    () => trierArticles(filtrerParCategorie(articles.filter((a) => articleCorrespond(a, q)), categories, categorie, (a) => a), triArticles),
    [articles, q, categories, categorie, triArticles]
  );

  // Longues listes (plus d'un millier d'articles) : affichage progressif.
  const listeArticles = useListeProgressive(articlesFiltres, `${q}|${categorie}|${triArticles.cle}|${triArticles.inverse}`);
  const listeDepot = useListeProgressive(depotFiltre, `${q}|${categorie}|${triDepot.cle}|${triDepot.inverse}`);
  const listeCamion = useListeProgressive(stockFiltre, `${q}|${categorie}|${vendeurId}|${triCamion.cle}|${triCamion.inverse}`);

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
    <>
    <Section className="rc-barre-outils">
      <Button variant="secondary" block icon={cloudUploadOutline} onClick={() => setImportOuvert(true)}>
        {t("Importer depuis Excel")}
      </Button>
      <Button variant="ghost" block icon={imageOutline} onClick={() => setPhotosOuvert(true)}>
        {t("Trouver les photos en ligne")}
      </Button>
      <Button variant="ghost" block icon={folderOpenOutline} onClick={() => navigate("/stock/categories")}>
        {t("Gérer les catégories")}
      </Button>
    </Section>
    <Section
      flush
      aside={
        articles.length > 0 ? (
          <span className="rc-liste-tete">
            <span>{tn(articlesFiltres.length, "{n} article", "{n} articles")}</span>
            <TriArticlesButton value={triArticles} onChange={setTriArticles} />
          </span>
        ) : undefined
      }
    >
      {articlesFiltres.length === 0 ? (
        <EmptyState
          icon={cubeOutline}
          title={t("Aucun article trouvé.")}
          message={q ? t("Essayez une autre désignation, un code ou un code-barres.") : undefined}
        />
      ) : (
        <>
        <EnteteTableau titre={t("Désignation")} colonnes={[t("Marque"), t("Unité"), t("Code-barres")]} dernier={t("Prix TTC")} vignette chevron />
        <div className="rc-list">
          {listeArticles.visibles.map((a) => (
            <Row
              key={a.id}
              className="rc-row--tableau"
              thumb
              chevron
              onClick={() => navigate(`/articles/${a.id}`)}
              leading={<ArticleImage src={a.img} alt="" />}
              title={a.designation}
              meta={joinMeta([a.code, a.unit, a.marque])}
              trailing={<CellulesTableau valeurs={[a.marque, a.unit, a.codeBarre]} dernier={<Money value={prixTTC(a)} />} />}
            />
          ))}
          <ChargerPlus reste={listeArticles.reste} onPlus={listeArticles.plus} />
        </div>
        </>
      )}
    </Section>
    </>
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
        {!q && depot.length > 0 && <DepotDashboard depot={depot} ventes={ventes} avecCategories={categories.length > 0} />}
        <Section
          flush
          aside={
            <span className="rc-liste-tete">
              {/* Titre « Articles » (masqué pendant une recherche), totaux en dessous. */}
              <span className="rc-liste-tete__titre">
                {!q && <span className="rc-section__label">{t("Articles")}</span>}
                <span>
                  {t("{articles} · {q} au dépôt", {
                    articles: tn(depot.length, "{n} article", "{n} articles"),
                    q: `${total} ${pieces(total)}`,
                  })}
                </span>
              </span>
              {depot.length > 0 && <TriArticlesButton value={triDepot} onChange={setTriDepot} criteres={CRITERES_STOCK} />}
            </span>
          }
        >
          {depotFiltre.length === 0 ? (
            <EmptyState icon={cubeOutline} title={t("Aucun article.")} message={q ? t("Essayez une autre recherche.") : undefined} />
          ) : (
            <>
            <EnteteTableau titre={t("Désignation")} colonnes={[t("Marque"), t("Unité"), t("Code-barres")]} dernier={t("Stock")} vignette />
            <div className="rc-list">
              {listeDepot.visibles.map((d) => (
                <Row
                  key={d.articleId}
                  className="rc-row--tableau"
                  thumb
                  onClick={() => navigate(`/articles/${d.articleId}`)}
                  muted={d.quantite === 0}
                  leading={<ArticleImage src={d.article.img} alt="" />}
                  title={d.article.designation}
                  meta={joinMeta([d.article.code, d.article.unit])}
                  trailing={
                    <CellulesTableau
                      valeurs={[d.article.marque, d.article.unit, d.article.codeBarre]}
                      dernier={<Quantity value={d.quantite} colisage={Number(d.article.colisage)} />}
                    />
                  }
                />
              ))}
              <ChargerPlus reste={listeDepot.reste} onPlus={listeDepot.plus} />
            </div>
            </>
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
          stock.length > 0 ? (
            <span className="rc-liste-tete">
              <span>
                {t("{articles} · {q} (théorique)", {
                  articles: tn(stock.length, "{n} article", "{n} articles"),
                  q: `${total} ${pieces(total)}`,
                })}
              </span>
              <TriArticlesButton value={triCamion} onChange={setTriCamion} criteres={CRITERES_STOCK} />
            </span>
          ) : undefined
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
            {listeCamion.visibles.map((item) => {
              const qte = Number(item.quantite);
              return (
                <Row
                  key={item.id}
                  thumb
                  onClick={() => navigate(`/stock/camion/${vendeurId}/articles/${item.articleId}`)}
                  muted={qte === 0}
                  leading={<ArticleImage src={item.article.img} alt="" />}
                  title={item.article.designation}
                  meta={joinMeta([item.article.code, item.article.unit])}
                  trailing={<Quantity value={qte} colisage={Number(item.article.colisage)} />}
                />
              );
            })}
            <ChargerPlus reste={listeCamion.reste} onPlus={listeCamion.plus} />
          </div>
        )}
      </Section>
    );
  };

  return (
    <IonPage>
      <AppHeader
        large
        eyebrow={web && lieu !== "articles" ? t("Stock") : undefined}
        title={web ? (lieu === "depot" ? t("Dépôt") : lieu === "camion" ? t("Camion") : t("Articles")) : t("Stock")}
        actions={<AccountButton />}
      >
        {!web && (
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
        )}
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
        {vueProduits && <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, réf…")} />}
        {vueProduits && <FiltreCategorie categories={categories} value={categorie} onChange={setCategorie} />}
      </AppHeader>

      <IonContent {...haut.contenu}>
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

        {!web && !camionSansVendeur && lieu !== "articles" && (
          <div className="rc-period">
            {lieu === "depot" ? (
              <Segmented
                label={t("Affichage du dépôt")}
                value={vueDepot}
                onChange={setVueDepot}
                variant="onglets"
                options={[
                  { value: "stock", label: t("Stock") },
                  { value: "entrees", label: t("B° Entrée") },
                  { value: "sorties", label: t("B° Sortie") },
                  { value: "retours", label: t("B° Retour") },
                ]}
              />
            ) : (
              <Segmented
                label={t("Affichage du camion")}
                value={vueCamion}
                onChange={setVueCamion}
                variant="onglets"
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
            <Fab icon={addOutline} label={t("B° Chargement")} onClick={() => navigate("/stock/chargement")} />
          ) : vueDepot === "retours" ? (
            <Fab icon={addOutline} label={t("B° Retour")} onClick={() => navigate("/stock/retour")} />
          ) : (
            <Fab icon={downloadOutline} label={t("B° Entrée")} onClick={() => navigate("/stock/entree")} />
          )
        ) : vueCamion === "retours" ? (
          <Fab icon={addOutline} label={t("B° Retour")} onClick={() => navigate("/stock/retour", { state: { vendeurId } })} />
        ) : (
          <Fab icon={addOutline} label={t("B° Chargement")} onClick={() => navigate("/stock/chargement", { state: { vendeurId } })} />
        )}
        <BoutonHaut visible={haut.visible} onClick={haut.remonter} />
      </IonContent>

      <ImportArticlesSheet
        isOpen={importOuvert}
        onDismiss={() => setImportOuvert(false)}
        onImporte={() => {
          fetchData();
          rechargerCategories();
        }}
        onClasser={() => {
          setImportOuvert(false);
          navigate("/stock/a-completer?vue=categorie");
        }}
      />

      <TrouverPhotosSheet isOpen={photosOuvert} onDismiss={() => setPhotosOuvert(false)} onFait={fetchData} />

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
