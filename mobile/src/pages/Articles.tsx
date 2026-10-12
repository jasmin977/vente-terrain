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
import { trierArticles, useTriArticles } from "../utils/triArticles";
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
} from "../ui";
import { t, tn } from "../i18n";

export default function Articles() {
  const navigate = useNavigate();
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
  const articlesTries = useMemo(() => trierArticles(articlesFiltres, tri), [articlesFiltres, tri]);
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

  return (
    <IonPage>
      <AppHeader large title={t("Articles")} actions={<AccountButton />}>
        <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, réf…")} />
        <FiltreCategorie categories={categories} value={categorie} onChange={setCategorie} />
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
                <TriArticlesButton value={tri} onChange={setTri} />
              </span>
            ) : undefined
          }
        >
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
              <EnteteTableau titre={t("Désignation")} colonnes={[t("Marque"), t("Unité"), t("Code-barres")]} dernier={t("Prix TTC")} vignette />
              <div className="rc-list">
                {liste.visibles.map((article) => (
                  <Row
                    key={article.id}
                    className="rc-row--tableau"
                    thumb
                    onClick={() => navigate(`/articles/${article.id}`)}
                    leading={<ArticleImage src={article.img} alt="" />}
                    title={article.designation}
                    meta={joinMeta([article.code, article.unit, article.marque])}
                    trailing={<CellulesTableau valeurs={[article.marque, article.unit, article.codeBarre]} dernier={<Money value={prixTTC(article)} />} />}
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
