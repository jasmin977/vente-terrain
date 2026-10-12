import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { IonAlert, IonContent, IonIcon, IonPage, useIonToast } from "@ionic/react";
import { checkmark, checkmarkDoneOutline } from "ionicons/icons";
import { classerArticles } from "../api/categories";
import SelecteurCategorie from "../components/SelecteurCategorie";
import { useCategories } from "../utils/useCategories";
import { confirmerSansStock, createEntreeDepot, getStockDepot } from "../api/stock";
import { updateArticle } from "../api/articles";
import { ApiError } from "../api/client";
import type { StockDepotItem } from "../types/stock";
import { useAuth } from "../auth/AuthContext";
import { articleCorrespond } from "../utils/articleSearch";
import { joinMeta, pieces } from "../utils/format";
import { margeDepuis } from "../utils/tarifs";
import {
  ActionBar,
  AppHeader,
  Button,
  ChargerPlus,
  EmptyState,
  Field,
  IconButton,
  PageNotice,
  SearchField,
  Section,
  Segmented,
  SkeletonList,
  useListeProgressive,
  BoutonHaut,
  useRetourEnHaut,
} from "../ui";
import { t, tn } from "../i18n";

type Vue = "prix" | "stock" | "categorie";

const nombre = (v: string | undefined) => (v === undefined || v.trim() === "" ? NaN : Number(v.replace(",", ".")));

/**
 * Articles à compléter après un import : ceux qui n'ont pas de prix d'achat (à saisir)
 * et ceux qui n'ont jamais eu de stock (quantité réelle à saisir, ou confirmation qu'il
 * n'y en a pas). Un article traité disparaît de la liste.
 */
export default function ArticlesACompleter() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [toast] = useIonToast();

  const navigate = useNavigate();
  const haut = useRetourEnHaut();
  const { categories, recharger: rechargerCategories } = useCategories();
  const vueDemandee = params.get("vue");
  const [vue, setVue] = useState<Vue>(vueDemandee === "stock" ? "stock" : vueDemandee === "categorie" ? "categorie" : "prix");
  // Articles cochés à classer (vue « sans catégorie »).
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [classerOuvert, setClasserOuvert] = useState(false);
  const [depot, setDepot] = useState<StockDepotItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Valeurs tapées, par article : prix d'achat (vue « prix ») ou quantité (vue « stock »).
  const [prix, setPrix] = useState<Record<string, string>>({});
  const [quantites, setQuantites] = useState<Record<string, string>>({});
  const [enCours, setEnCours] = useState<string | null>(null);
  const [confirmerLot, setConfirmerLot] = useState(false);

  const charger = useCallback(async () => {
    setError(null);
    try {
      setDepot(await getStockDepot());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Impossible de charger les articles"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const recherche = q.trim();
  // Sans prix d'achat : ceux qui ont du stock d'abord (ils faussent la valeur et la marge du dépôt).
  const sansPrix = useMemo(
    () => depot.filter((d) => !(Number(d.article.prixAchat) > 0)).sort((a, b) => Number(b.quantite > 0) - Number(a.quantite > 0)),
    [depot]
  );
  const sansStock = useMemo(() => depot.filter((d) => d.aConfirmer), [depot]);

  // Sans catégorie : seulement pour une société qui a des catégories.
  const sansCategorie = useMemo(() => (categories.length ? depot.filter((d) => !d.article.categorieId) : []), [depot, categories]);

  const liste = vue === "prix" ? sansPrix : vue === "stock" ? sansStock : sansCategorie;
  const filtree = useMemo(() => (recherche ? liste.filter((d) => articleCorrespond(d.article, recherche)) : liste), [liste, recherche]);
  const progressive = useListeProgressive(filtree, `${vue}|${recherche}`);

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const message = (texte: string) => toast({ message: texte, duration: 1800, position: "top", cssClass: "rc-toast" });
  const echec = (err: unknown, defaut: string) => setError(err instanceof ApiError ? err.message : defaut);

  const enregistrerPrix = async (d: StockDepotItem) => {
    const valeur = nombre(prix[d.articleId]);
    if (!(valeur > 0)) return;
    setEnCours(d.articleId);
    setError(null);
    try {
      await updateArticle(d.articleId, { prixAchat: valeur });
      setDepot((cur) => cur.map((x) => (x.articleId === d.articleId ? { ...x, article: { ...x.article, prixAchat: valeur } } : x)));
      setPrix((cur) => {
        const reste = { ...cur };
        delete reste[d.articleId];
        return reste;
      });
      message(t("Prix d'achat enregistré"));
    } catch (err) {
      echec(err, t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };

  const marquerConfirmes = (ids: string[]) =>
    setDepot((cur) => cur.map((x) => (ids.includes(x.articleId) ? { ...x, aConfirmer: false } : x)));

  const confirmerUn = async (d: StockDepotItem) => {
    setEnCours(d.articleId);
    setError(null);
    try {
      await confirmerSansStock([d.articleId]);
      marquerConfirmes([d.articleId]);
      message(t("Confirmé : aucun stock"));
    } catch (err) {
      echec(err, t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };

  // Tous les articles affichés pour lesquels aucune quantité n'a été saisie.
  const aConfirmerEnLot = filtree.filter((d) => !(nombre(quantites[d.articleId]) > 0));
  const confirmerEnLot = async () => {
    const ids = aConfirmerEnLot.map((d) => d.articleId);
    setConfirmerLot(false);
    setEnCours("lot");
    setError(null);
    try {
      await confirmerSansStock(ids);
      marquerConfirmes(ids);
      message(tn(ids.length, "{n} article confirmé sans stock", "{n} articles confirmés sans stock"));
    } catch (err) {
      echec(err, t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };

  // Quantités saisies : un seul bon d'entrée « Stock initial ».
  const lignesStock = sansStock
    .map((d) => ({ articleId: d.articleId, quantite: nombre(quantites[d.articleId]) }))
    .filter((l) => l.quantite > 0);
  const enregistrerStock = async () => {
    setEnCours("stock");
    setError(null);
    try {
      await createEntreeDepot({ reference: "Stock initial", lignes: lignesStock.map((l) => ({ ...l, unite: "UNITE" as const })) });
      setQuantites({});
      await charger();
      message(tn(lignesStock.length, "Stock initial de {n} article enregistré", "Stock initial de {n} articles enregistré"));
    } catch (err) {
      echec(err, t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };

  const basculer = (id: string) =>
    setSelection((cur) => {
      const suivante = new Set(cur);
      if (!suivante.delete(id)) suivante.add(id);
      return suivante;
    });
  const toutSelectionne = filtree.length > 0 && filtree.every((d) => selection.has(d.articleId));
  const basculerTout = () => setSelection(toutSelectionne ? new Set() : new Set(filtree.map((d) => d.articleId)));

  const classerSelection = async (categorieId: string) => {
    const ids = [...selection];
    setClasserOuvert(false);
    setEnCours("classer");
    setError(null);
    try {
      await classerArticles(ids, categorieId);
      setDepot((cur) => cur.map((x) => (selection.has(x.articleId) ? { ...x, article: { ...x.article, categorieId } } : x)));
      setSelection(new Set());
      await rechargerCategories();
      message(tn(ids.length, "{n} article classé", "{n} articles classés"));
    } catch (err) {
      echec(err, t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };

  const ligne = (d: StockDepotItem) => {
    const id = d.articleId;
    if (vue === "categorie") {
      const coche = selection.has(id);
      return (
        <button type="button" className="rc-todo rc-todo--choix" key={id} role="checkbox" aria-checked={coche} onClick={() => basculer(id)}>
          <span className={`rc-check rc-check--box${coche ? " rc-check--on" : ""}`} aria-hidden="true">
            <IonIcon icon={checkmark} />
          </span>
          <span className="rc-todo__texte">
            <span className="rc-todo__titre">{d.article.designation}</span>
            <span className="rc-todo__meta">{joinMeta([d.article.code ?? d.article.codeBarre, d.article.unit])}</span>
          </span>
        </button>
      );
    }
    const achat = nombre(prix[id]);
    const marge = vue === "prix" && achat > 0 ? margeDepuis(Number(d.article.prixVente), achat) : undefined;
    return (
      <div className="rc-todo" key={id}>
        <div className="rc-todo__texte">
          <p className="rc-todo__titre">{d.article.designation}</p>
          <p className="rc-todo__meta">
            {joinMeta([
              d.article.code ?? d.article.codeBarre,
              d.article.unit,
              vue === "prix" && d.quantite > 0 && t("Dépôt : {q}", { q: `${d.quantite} ${pieces(d.quantite)}` }),
              marge !== undefined && t("Marge {n} %", { n: marge }),
            ])}
          </p>
        </div>
        <div className="rc-todo__saisie">
          {vue === "prix" ? (
            <>
              <Field
                hideLabel
                label={t("Prix d'achat HT : {nom}", { nom: d.article.designation })}
                type="number"
                inputMode="decimal"
                placeholder="0.000"
                value={prix[id] ?? ""}
                onChange={(v) => setPrix((cur) => ({ ...cur, [id]: v }))}
                suffix="TND"
              />
              <IconButton
                icon={checkmark}
                label={t("Enregistrer le prix d'achat")}
                variant="filled"
                disabled={!(achat > 0) || enCours === id}
                onClick={() => enregistrerPrix(d)}
              />
            </>
          ) : (
            <>
              <Field
                hideLabel
                label={t("Quantité en pièces : {nom}", { nom: d.article.designation })}
                type="number"
                inputMode="decimal"
                placeholder="0"
                value={quantites[id] ?? ""}
                onChange={(v) => setQuantites((cur) => ({ ...cur, [id]: v }))}
                suffix={t("pcs")}
              />
              <IconButton
                icon={checkmark}
                label={t("Confirmer : aucun stock")}
                variant="filled"
                disabled={nombre(quantites[id]) > 0 || enCours === id || enCours === "lot"}
                onClick={() => confirmerUn(d)}
              />
            </>
          )}
        </div>
      </div>
    );
  };

  const firstLoad = loading && depot.length === 0;

  return (
    <IonPage>
      <AppHeader backHref="/stock" title={t("À compléter")}>
        <Segmented
          label={t("Ce qui reste à compléter")}
          value={vue}
          onChange={(v) => {
            setVue(v);
            setQ("");
          }}
          options={[
            { value: "prix", label: t("Prix d'achat"), hint: String(sansPrix.length) },
            { value: "stock", label: t("Sans stock"), hint: String(sansStock.length) },
            { value: "categorie", label: t("Catégorie"), hint: String(sansCategorie.length) },
          ]}
        />
        <SearchField value={q} onChange={setQ} placeholder={t("Désignation, marque, réf…")} />
      </AppHeader>

      <IonContent {...haut.contenu}>
        {error && <PageNotice>{error}</PageNotice>}

        {firstLoad ? (
          <SkeletonList thumb={false} />
        ) : liste.length === 0 ? (
          vue === "categorie" && categories.length === 0 ? (
            <EmptyState
              icon={checkmark}
              title={t("Aucune catégorie.")}
              message={t("Créez d'abord vos catégories, puis classez-y les articles.")}
              action={
                <Button variant="secondary" onClick={() => navigate("/stock/categories")}>
                  {t("Gérer les catégories")}
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={checkmark}
              title={
                vue === "prix"
                  ? t("Tous les articles ont un prix d'achat.")
                  : vue === "stock"
                    ? t("Aucun article sans stock à confirmer.")
                    : t("Tous les articles ont une catégorie.")
              }
              message={t("Rien à compléter ici.")}
            />
          )
        ) : (
          <>
            <Section>
              <p className="rc-footnote">
                {vue === "prix"
                  ? t("Saisissez le prix d'achat HT puis validez : la marge apparaît. Les articles en stock sont en premier.")
                  : vue === "stock"
                    ? t("Saisissez la quantité réelle au dépôt, ou confirmez avec ✓ qu'il n'y a pas de stock.")
                    : t("Cochez les articles (la recherche aide à les regrouper), puis classez-les d'un coup dans une catégorie.")}
              </p>
              {vue === "categorie" && filtree.length > 0 && (
                <Button variant="secondary" block icon={checkmarkDoneOutline} onClick={basculerTout}>
                  {toutSelectionne ? t("Tout désélectionner") : tn(filtree.length, "Tout sélectionner ({n} article)", "Tout sélectionner ({n} articles)")}
                </Button>
              )}
              {vue === "stock" && aConfirmerEnLot.length > 0 && (
                <Button variant="secondary" block icon={checkmarkDoneOutline} loading={enCours === "lot"} onClick={() => setConfirmerLot(true)}>
                  {tn(aConfirmerEnLot.length, "Confirmer : aucun stock ({n} article)", "Confirmer : aucun stock ({n} articles)")}
                </Button>
              )}
            </Section>

            <Section flush aside={tn(filtree.length, "{n} article", "{n} articles")}>
              {filtree.length === 0 ? (
                <EmptyState icon={checkmark} title={t("Aucun article trouvé.")} message={t("Essayez une autre recherche.")} />
              ) : (
                <div className="rc-list">
                  {progressive.visibles.map(ligne)}
                  <ChargerPlus reste={progressive.reste} onPlus={progressive.plus} />
                </div>
              )}
            </Section>
          </>
        )}
        <BoutonHaut visible={haut.visible} onClick={haut.remonter} />
      </IonContent>

      {vue === "stock" && lignesStock.length > 0 && (
        <ActionBar>
          <Button size="lg" block loading={enCours === "stock"} onClick={enregistrerStock}>
            {tn(lignesStock.length, "Enregistrer le stock ({n} article)", "Enregistrer le stock ({n} articles)")}
          </Button>
        </ActionBar>
      )}

      {vue === "categorie" && selection.size > 0 && (
        <ActionBar>
          <Button size="lg" block loading={enCours === "classer"} onClick={() => setClasserOuvert(true)}>
            {tn(selection.size, "Classer {n} article…", "Classer {n} articles…")}
          </Button>
        </ActionBar>
      )}

      <SelecteurCategorie
        isOpen={classerOuvert}
        categories={categories}
        recharger={rechargerCategories}
        titre={tn(selection.size, "Classer {n} article dans…", "Classer {n} articles dans…")}
        onSelect={classerSelection}
        onDismiss={() => setClasserOuvert(false)}
      />

      <IonAlert
        isOpen={confirmerLot}
        onDidDismiss={() => setConfirmerLot(false)}
        header={t("Confirmer qu'il n'y a aucun stock ?")}
        message={tn(
          aConfirmerEnLot.length,
          "{n} article sera marqué « sans stock confirmé » et ne sera plus signalé.",
          "{n} articles seront marqués « sans stock confirmé » et ne seront plus signalés."
        )}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Confirmer"), handler: confirmerEnLot },
        ]}
      />
    </IonPage>
  );
}
