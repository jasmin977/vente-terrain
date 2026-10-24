import { joinMeta } from "../utils/format";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { IonContent, IonPage, IonRefresher, IonRefresherContent, RefresherEventDetail } from "@ionic/react";
import { addOutline, cubeOutline } from "ionicons/icons";
import { listArticles } from "../offline/donnees";
import { useApresSync } from "../offline/sync";
import type { Article } from "../types/article";
import ArticleImage from "../components/ArticleImage";
import { prixTTC } from "../utils/tarifs";
import TriArticlesButton from "../components/TriArticlesButton";
import FiltreCategorie from "../components/FiltreCategorie";
import { filtrerParCategorie } from "../utils/categories";
import { useCategories } from "../utils/useCategories";
import { margeArticle, nomsCategorie, trierArticles, useTriArticles } from "../utils/triArticles";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import {
  AccountButton,
  AppHeader,
  CellulesTableau,
  EnteteTableau,
  ChargerPlus,
  EmptyState,
  Fab,
  FabSpacer,
  Money,
  PageNotice,
  Row,
  SearchField,
  Section,
  SkeletonList,
  useListeProgressive,
  BoutonHaut,
  useRetourEnHaut,
  useEcranLarge,
} from "../ui";
import { t, tn } from "../i18n";

export default function Articles() {
  const navigate = useNavigate();
  const web = useEcranLarge();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [articles, setArticles] = useState<Article[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tri, setTri] = useTriArticles();
  const haut = useRetourEnHaut();
  const { categories } = useCategories();
  const [categorie, setCategorie] = useState<string | undefined>(undefined);
  const articlesFiltres = useMemo(() => filtrerParCategorie(articles, categories, categorie, (a) => a), [articles, categories, categorie]);
  const articlesTries = useMemo(() => trierArticles(articlesFiltres, tri, categories), [articlesFiltres, tri, categories]);
  const liste = useListeProgressive(articlesTries, `${query}|${categorie}|${tri.cle}|${tri.inverse}`);

  const fetchArticles = useCallback(async () => {
    setError(null);
    try {
      const data = await listArticles({ q: query || undefined });
      setArticles(data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les articles"));
    } finally {
      setLoading(false);
    }
  }, [query]);

  useApresSync(fetchArticles);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(fetchArticles, 300);
    return () => clearTimeout(timeout);
  }, [fetchArticles]);

  // Scan rapide : un article reconnu s'ouvre directement, sinon on recherche le code.
  const handleScan = async (code: string) => {
    try {
      const trouves = await listArticles({ codeBarre: code });
      if (trouves.length === 1) {
        navigate(`/articles/${trouves[0].id}`);
        return;
      }
    } catch {
      // repli sur la recherche texte ci-dessous
    }
    setQuery(code);
  };

  const handleRefresh = async (e: CustomEvent<RefresherEventDetail>) => {
    await fetchArticles();
    e.detail.complete();
  };

  const firstLoad = loading && articles.length === 0;

  // Largeurs (px) des colonnes : catégorie, sous-catégorie, marque, code-barres, (admin) prix d'achat, prix de vente.
  const LARGEUR_CODE = 160;
  const largeurs = isAdmin ? [220, 140, 180, 110] : [220, 140, 180];
  // Colonnes du tableau : catégorie, sous-catégorie, marque, code-barres et (admin) prix d'achat TTC.
  const cellulesArticle = (a: Article) => {
    const { sous } = nomsCategorie(categories, a.categorieId);
    return [sous, a.marque, <Money key="v" value={prixTTC(a)} />];
  };
  // Marge (admin) : rouge si négative, orange si proche de zéro.
  const margeCellule = (a: Article) => {
    const m = margeArticle(a);
    if (m === undefined) return "—";
    const classe = m < 0 ? " rc-marge--negative" : m < 3 ? " rc-marge--faible" : "";
    return <span className={`rc-marge${classe}`}>{`${m.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`}</span>;
  };

  return (
    <IonPage className="rc-page--large">
      <AppHeader large title={t("Liste des articles")} actions={<AccountButton />}>
        <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, réf…")} />
        {!web && <FiltreCategorie categories={categories} value={categorie} onChange={setCategorie} />}
      </AppHeader>

      <IonContent {...haut.contenu}>
        <IonRefresher slot="fixed" onIonRefresh={handleRefresh}>
          <IonRefresherContent />
        </IonRefresher>

        {error && (
          <PageNotice actionLabel={t("Réessayer")} onAction={() => { setLoading(true); fetchArticles(); }}>
            {error}
          </PageNotice>
        )}

        <Section
          flush
          aside={
            !firstLoad && articles.length > 0 ? (
              <span className="rc-liste-tete">
                <span>{tn(articlesTries.length, "{n} article", "{n} articles")}</span>
                <span className="rc-tri-bouton">
                  <TriArticlesButton value={tri} onChange={setTri} />
                </span>
              </span>
            ) : undefined
          }
        >
          {/* Web : le filtre de catégorie est juste au-dessus du tableau. */}
          {web && <FiltreCategorie categories={categories} value={categorie} onChange={setCategorie} />}
          {firstLoad ? (
            <SkeletonList thumb />
          ) : !error && articles.length === 0 ? (
            <EmptyState
              icon={cubeOutline}
              title={t("Aucun article trouvé.")}
              message={query ? t("Essayez une autre désignation, un code ou un code-barres.") : undefined}
            />
          ) : (
            articles.length > 0 && (
              <>
              <EnteteTableau
                titre={t("Désignation")}
                premiere={{ label: t("Code-barres"), cle: "codeBarre", largeur: LARGEUR_CODE }}
                colonnes={[t("Sous-catégorie"), t("Marque"), t("Prix de vente TTC")]}
                dernier={isAdmin ? t("Marge") : ""}
                largeurs={largeurs}
                vignette
                tri={{
                  titre: "alpha",
                  colonnes: ["sousCategorie", "marque", "prix"],
                  dernier: isAdmin ? "marge" : undefined,
                  valeur: tri,
                  onChange: setTri,
                }}
              />
              <div className="rc-list">
                {liste.visibles.map((article) => (
                  <Row
                    key={article.id}
                    className="rc-row--tableau"
                    thumb
                    onClick={() => navigate(`/articles/${article.id}`)}
                    leading={
                      web ? (
                        <>
                          <span className="rc-tableau__cellule rc-tableau__premiere rc-web-only--table" style={{ "--rc-col": `${LARGEUR_CODE}px` } as React.CSSProperties}>
                            <span className="rc-tableau__texte">{article.codeBarre}</span>
                          </span>
                          <span className="rc-tableau__photo">
                            <ArticleImage src={article.img} alt="" />
                          </span>
                        </>
                      ) : (
                        <ArticleImage src={article.img} alt="" />
                      )
                    }
                    title={article.designation}
                    meta={joinMeta([article.code, article.unit, article.marque])}
                    trailing={<CellulesTableau valeurs={cellulesArticle(article)} largeurs={largeurs} dernier={isAdmin ? margeCellule(article) : null} />}
                  />
                ))}
                <ChargerPlus reste={liste.reste} onPlus={liste.plus} />
              </div>
              </>
            )
          )}
        </Section>
        {isAdmin && <FabSpacer />}

        {isAdmin && <Fab icon={addOutline} label={t("Nouvel article")} onClick={() => navigate("/articles/new")} />}
        <BoutonHaut visible={haut.visible} onClick={haut.remonter} />
      </IonContent>
    </IonPage>
  );
}
