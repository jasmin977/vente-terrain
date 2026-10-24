import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage } from "@ionic/react";
import { addOutline, checkmarkDoneOutline, phonePortraitOutline, searchOutline, trashOutline } from "ionicons/icons";
import {
  abandonnerInventaire,
  enregistrerComptage,
  getInventaire,
  retirerComptage,
  validerInventaire,
} from "../api/inventaires";
import { listArticles } from "../api/articles";
import type { Article } from "../types/article";
import type { Inventaire, LigneInventaire, LigneInventaireInput } from "../types/inventaire";
import { useAuth } from "../auth/AuthContext";
import ImportCollecteSheet, { type LigneImportee } from "../components/ImportCollecteSheet";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import InventaireCountSheet, { type LigneACompter } from "./InventaireCountSheet";
import InventaireTableau, { type InventaireTableauHandle } from "../components/InventaireTableau";
import { formatAmount, formatColis, formatDateTime, joinMeta } from "../utils/format";
import { motifEcartLabel, statutInventaireLabel } from "../utils/labels";
import { articleCorrespond, articleMotsCles, articleParCode } from "../utils/articleSearch";
import {
  ActionBar,
  AppHeader,
  Button,
  EmptyState,
  Money,
  PageNotice,
  PickerSheet,
  Row,
  SearchField,
  Section,
  Segmented,
  SkeletonList,
  Tag,
  useEcranLarge,
} from "../ui";
import { t, tn } from "../i18n";

type Filtre = "a_compter" | "comptes" | "ecarts" | "tous";

/** Rafraîchissement du résumé après une saisie rapide : groupé pour ne pas relire l'inventaire à chaque Entrée. */
const DELAI_RAFRAICHISSEMENT = 900;

function EcartTag({ ecart }: { ecart: number }) {
  if (ecart === 0) return <Tag tone="positive">{t("Conforme")}</Tag>;
  return <Tag tone={ecart < 0 ? "danger" : "warning"}>{ecart < 0 ? `−${-ecart}` : `+${ecart}`}</Tag>;
}

export default function InventaireDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";

  const [inv, setInv] = useState<Inventaire | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filtre, setFiltre] = useState<Filtre>("a_compter");
  const [query, setQuery] = useState("");
  const [enComptage, setEnComptage] = useState<LigneACompter | null>(null);
  const [saving, setSaving] = useState(false);
  const [catalogue, setCatalogue] = useState<Article[]>([]);
  const [ajoutOpen, setAjoutOpen] = useState(false);
  const [confirm, setConfirm] = useState<"valider" | "abandonner" | null>(null);
  const [busy, setBusy] = useState(false);
  // Web : comptage dans un tableau (une cellule par article) au lieu d'une fenêtre par article.
  const web = useEcranLarge();
  const tableau = useRef<InventaireTableauHandle>(null);
  const rafraichir = useRef<number | undefined>(undefined);
  // Articles trouvés hors liste, ajoutés au tableau et pas encore comptés.
  const [ajouts, setAjouts] = useState<LigneInventaire[]>([]);

  const [importPda, setImportPda] = useState(false);
  // Collecte du PDA : la quantité scannée devient la quantité comptée de chaque article.
  const importerCollecte = async (importees: LigneImportee[]) => {
    for (const imp of importees) await enregistrerComptage(id!, imp.articleId, { quantiteReelle: imp.quantite, motif: null, note: null });
    await charger();
    return 0;
  };

  const charger = useCallback(async () => {
    try {
      const data = await getInventaire(id!);
      setInv(data);
      setError(null);
      return data;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Inventaire introuvable"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    charger().then((data) => {
      if (data?.statut === "VALIDE") setFiltre("ecarts");
      else if (data && web) setFiltre("tous");
    });
    // `web` ne change pas en cours de route : le filtre de départ ne se recalcule pas
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [charger]);

  const enCours = inv?.statut === "EN_COURS";
  const lignes = useMemo(() => {
    const serveur = inv?.lignes ?? [];
    const connus = new Set(serveur.map((l) => l.articleId));
    return [...serveur, ...ajouts.filter((a) => !connus.has(a.articleId))];
  }, [inv, ajouts]);
  const q = query.trim();
  const visibles = useMemo(
    () =>
      lignes.filter((l) => {
        if (!articleCorrespond(l.article, q)) return false;
        if (filtre === "a_compter") return l.quantiteReelle === null;
        if (filtre === "comptes") return l.quantiteReelle !== null;
        if (filtre === "ecarts") return l.ecart !== null && l.ecart !== 0;
        return true;
      }),
    [lignes, filtre, q]
  );

  // Web : à l'ouverture, le curseur est déjà dans la première cellule à compter.
  const dejaFocus = useRef(false);
  useEffect(() => {
    if (web && enCours && visibles.length > 0 && !dejaFocus.current) {
      dejaFocus.current = true;
      window.setTimeout(() => tableau.current?.focusPremiere(), 200);
    }
  }, [web, enCours, visibles.length]);

  // Tableau (web) : enregistre le comptage tout de suite dans l'affichage, puis sur le serveur ; le résumé se met à jour juste après.
  const sauverRapide = async (articleId: string, quantite: number) => {
    const ligne = lignes.find((l) => l.articleId === articleId);
    if (!ligne) return;
    const maj = { ...ligne, quantiteReelle: quantite, ecart: quantite - ligne.quantiteTheorique };
    setInv((prev) => (prev ? { ...prev, lignes: prev.lignes.some((l) => l.articleId === articleId) ? prev.lignes.map((l) => (l.articleId === articleId ? maj : l)) : [...prev.lignes, maj] } : prev));
    setAjouts((a) => a.filter((x) => x.articleId !== articleId));
    try {
      // Le motif et la note déjà saisis sont conservés (le tableau ne change que la quantité).
      await enregistrerComptage(id!, articleId, { quantiteReelle: quantite, motif: quantite < ligne.quantiteTheorique ? ligne.motif : null, note: ligne.note });
      window.clearTimeout(rafraichir.current);
      rafraichir.current = window.setTimeout(() => void charger(), DELAI_RAFRAICHISSEMENT);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement du comptage"));
      await charger();
    }
  };

  // Ajoute un article trouvé hors liste au tableau et place le curseur dans sa cellule.
  const ajouterAuTableau = (article: Article) => {
    if (!lignes.some((l) => l.articleId === article.id)) {
      setAjouts((a) => [...a, { articleId: article.id, article, quantiteTheorique: 0, quantiteReelle: null, ecart: null, motif: null, note: null }]);
    }
    setQuery("");
    setFiltre("tous");
    window.setTimeout(() => tableau.current?.focus(article.id), 80);
  };

  const ouvrirComptage = (l: Pick<LigneInventaire, "article" | "quantiteTheorique" | "quantiteReelle" | "motif" | "note">) =>
    setEnComptage({ article: l.article, quantiteTheorique: l.quantiteTheorique, quantiteReelle: l.quantiteReelle, motif: l.motif, note: l.note });

  const enregistrer = async (input: LigneInventaireInput) => {
    if (!enComptage) return;
    setSaving(true);
    try {
      await enregistrerComptage(id!, enComptage.article.id, input);
      setEnComptage(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement du comptage"));
    } finally {
      setSaving(false);
    }
  };

  const retirer = async () => {
    if (!enComptage) return;
    setSaving(true);
    try {
      await retirerComptage(id!, enComptage.article.id);
      setEnComptage(null);
      await charger();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec"));
    } finally {
      setSaving(false);
    }
  };

  // Scan rapide : ouvre directement le comptage de l'article scanné, qu'il soit
  // attendu dans le camion ou trouvé hors liste.
  const handleScan = async (code: string) => {
    const ligne = articleParCode(lignes.map((l) => l.article), code);
    if (ligne) {
      const l = lignes.find((x) => x.articleId === ligne.id)!;
      if (enCours && web) {
        setQuery("");
        setFiltre("tous");
        window.setTimeout(() => tableau.current?.focus(l.articleId), 80);
      } else if (enCours) ouvrirComptage(l);
      else setQuery(code);
      return;
    }
    if (enCours) {
      let cat = catalogue;
      if (cat.length === 0) {
        try {
          cat = await listArticles();
          setCatalogue(cat);
        } catch {
          // catalogue indisponible : on se rabat sur la recherche
        }
      }
      const article = articleParCode(cat, code);
      if (article) {
        if (web) ajouterAuTableau(article);
        else ouvrirComptage({ article, quantiteTheorique: 0, quantiteReelle: null, motif: null, note: null });
        return;
      }
    }
    setQuery(code);
  };

  const ouvrirAjout = async () => {
    setAjoutOpen(true);
    if (catalogue.length === 0) {
      try {
        setCatalogue(await listArticles());
      } catch {
        setAjoutOpen(false);
        setError(t("Impossible de charger le catalogue"));
      }
    }
  };

  const valider = async () => {
    setBusy(true);
    try {
      const data = await validerInventaire(id!);
      setInv(data);
      setFiltre("ecarts");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la validation"));
    } finally {
      setBusy(false);
    }
  };

  const abandonner = async () => {
    setBusy(true);
    try {
      await abandonnerInventaire(id!);
      navigate("/inventaires", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec"));
      setBusy(false);
    }
  };

  if (!isAdmin) return <Navigate to="/factures" replace />;

  const r = inv?.resume;
  const nonComptes = r ? r.nbLignes - r.nbComptes : 0;
  const dejaListes = new Set(lignes.map((l) => l.articleId));
  const depot = inv?.lieu === "DEPOT";

  return (
    <IonPage className={web ? "rc-page--large" : undefined}>
      <AppHeader
        backHref="/inventaires"
        title={inv ? (inv.vendeur ? t("Camion de {nom}", { nom: inv.vendeur.nom }) : inv.libelle ?? t("Tout le dépôt")) : t("Inventaire")}
        eyebrow={inv ? t("Inventaire · {date}", { date: formatDateTime(inv.statut === "VALIDE" ? inv.dateValidation ?? inv.createdAt : inv.createdAt) }) : undefined}
        actions={
          web && enCours && r ? (
            <Button icon={checkmarkDoneOutline} disabled={r.nbComptes === 0} loading={busy} onClick={() => setConfirm("valider")}>
              {t("Valider l'inventaire")}
            </Button>
          ) : undefined
        }
      />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}
        {loading && <SkeletonList rows={6} thumb />}

        {inv && r && (
          <>
            <div className="rc-summary">
              <p className="rc-summary__label">
                {enCours ? t("Manque constaté à ce stade") : t("Manque constaté")} · {t("prix de vente")}
              </p>
              <Money value={r.valeurManque} size="xl" tone={r.valeurManque > 0 ? "danger" : "default"} />
              <div className="rc-tags">
                <Tag tone={enCours ? "accent" : "neutral"} dot={enCours}>
                  {statutInventaireLabel[inv.statut]}
                </Tag>
              </div>
              <dl className="rc-stats">
                <div>
                  <dt>{t("Comptés")}</dt>
                  <dd>
                    {r.nbComptes}
                    {enCours && <small> / {r.nbLignes}</small>}
                  </dd>
                </div>
                <div>
                  <dt>{t("Écarts")}</dt>
                  <dd>{r.nbEcarts}</dd>
                </div>
                <div>
                  <dt>{t("Manque")}</dt>
                  <dd className={r.manqueUnites ? "rc-stats--danger" : undefined}>
                    {r.manqueUnites} <small>{t("pcs")}</small>
                  </dd>
                </div>
                <div>
                  <dt>{t("Surplus")}</dt>
                  <dd>
                    {r.surplusUnites} <small>{t("pcs")}</small>
                  </dd>
                </div>
              </dl>
            </div>

            <div className="rc-period">
              <Segmented
                label={t("Afficher")}
                value={filtre}
                onChange={setFiltre}
                options={
                  enCours
                    ? [
                        ...(web ? [{ value: "tous" as Filtre, label: t("Tous"), hint: `${r.nbLignes}` }] : []),
                        { value: "a_compter", label: t("À compter"), hint: `${nonComptes}` },
                        { value: "comptes", label: t("Comptés"), hint: `${r.nbComptes}` },
                        { value: "ecarts", label: t("Écarts"), hint: `${r.nbEcarts}` },
                      ]
                    : [
                        { value: "ecarts", label: t("Écarts"), hint: `${r.nbEcarts}` },
                        { value: "tous", label: t("Tous comptés"), hint: `${r.nbComptes}` },
                      ]
                }
              />
              <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, réf…")} />
            </div>

            <Section flush>
              {visibles.length === 0 ? (
                <EmptyState
                  icon={q ? searchOutline : checkmarkDoneOutline}
                  title={
                    q
                      ? t("Aucun article trouvé.")
                      : filtre === "a_compter"
                        ? t("Tout est compté.")
                        : filtre === "ecarts"
                          ? t("Aucun écart.")
                          : t("Aucun article compté.")
                  }
                  message={
                    filtre === "a_compter" && !q
                      ? depot
                        ? t("Validez l'inventaire pour mettre à jour le stock du dépôt.")
                        : t("Validez l'inventaire pour mettre à jour le stock du camion.")
                      : undefined
                  }
                />
              ) : web && enCours ? (
                <InventaireTableau ref={tableau} lignes={visibles} modifiable onSauver={(articleId, q) => void sauverRapide(articleId, q)} />
              ) : (
                <div className="rc-list">
                  {visibles.map((l) => {
                    const c = Number(l.article.colisage) || 1;
                    const compte = l.quantiteReelle !== null;
                    const details = [
                      t("Attendu {q}", { q: `${l.quantiteTheorique}${c > 1 && l.quantiteTheorique !== 0 ? ` (${formatColis(l.quantiteTheorique, c)})` : ""}` }),
                      // Seul un manque se justifie par un motif ; un surplus n'a qu'une note.
                      l.motif ? motifEcartLabel[l.motif] : l.ecart && l.ecart < 0 ? t("Non justifié") : null,
                      l.note,
                    ];
                    return (
                      <Row
                        key={l.articleId}
                        thumb
                        onClick={enCours ? () => ouvrirComptage(l) : undefined}
                        leading={<ArticleImage src={l.article.img} alt="" />}
                        title={l.article.designation}
                        meta={joinMeta(details)}
                        trailing={
                          compte ? (
                            <>
                              <span className="rc-qty">
                                <span className="rc-qty__n">{l.quantiteReelle}</span> comptés
                              </span>
                              <EcartTag ecart={l.ecart ?? 0} />
                            </>
                          ) : (
                            <span className="rc-row__note">{t("À compter")}</span>
                          )
                        }
                        chevron={enCours}
                      />
                    );
                  })}
                </div>
              )}
            </Section>

            {enCours && (
              <Section>
                <Button variant="secondary" size="lg" block icon={addOutline} onClick={ouvrirAjout}>
                  {t("Article trouvé hors liste")}
                </Button>
                <Button variant="ghost" block icon={phonePortraitOutline} onClick={() => setImportPda(true)}>
                  {t("Télécharger depuis le PDA")}
                </Button>
                <ImportCollecteSheet isOpen={importPda} onDismiss={() => setImportPda(false)} destination={t("Inventaire")} onImporter={importerCollecte} />
              </Section>
            )}

            {!enCours && (
              <Section>
                <p className="rc-footnote">
                  {t(
                    depot
                      ? "Stock du dépôt remplacé par les quantités comptées le {date} par {admin}. Valeur du manque calculée au prix de vente ({m} TND)."
                      : "Stock du camion remplacé par les quantités comptées le {date} par {admin}. Valeur du manque calculée au prix de vente ({m} TND).",
                    {
                      date: formatDateTime(inv.dateValidation ?? inv.createdAt),
                      admin: inv.admin.nom,
                      m: formatAmount(r.valeurManque),
                    }
                  )}
                </p>
              </Section>
            )}

            {enCours && (
              <Section>
                <Button variant="danger" block icon={trashOutline} disabled={busy} onClick={() => setConfirm("abandonner")}>
                  {t("Abandonner l'inventaire")}
                </Button>
              </Section>
            )}
          </>
        )}
      </IonContent>

      {inv && enCours && r && !web && (
        <ActionBar
          hint={
            r.nbComptes === 0
              ? t("Comptez au moins un article")
              : nonComptes > 0
                ? tn(nonComptes, "{n} article non compté gardera la quantité de l'app", "{n} articles non comptés garderont la quantité de l'app")
                : t("Tous les articles sont comptés")
          }
        >
          <Button size="lg" block icon={checkmarkDoneOutline} disabled={r.nbComptes === 0} loading={busy} onClick={() => setConfirm("valider")}>
            {t("Valider l'inventaire")}
          </Button>
        </ActionBar>
      )}

      <InventaireCountSheet
        ligne={enComptage}
        saving={saving}
        onSave={enregistrer}
        onRemove={retirer}
        onDismiss={() => setEnComptage(null)}
      />

      <PickerSheet
        isOpen={ajoutOpen}
        title={depot ? t("Article trouvé dans le dépôt") : t("Article trouvé dans le camion")}
        searchPlaceholder={t("Désignation, marque, réf…")}
        emptyLabel={t("Aucun article trouvé.")}
        onDismiss={() => setAjoutOpen(false)}
        onScan={(code) => articleParCode(catalogue, code)?.id}
        onSelect={(articleId) => {
          setAjoutOpen(false);
          const existante = lignes.find((l) => l.articleId === articleId);
          const article = catalogue.find((a) => a.id === articleId);
          if (web && (existante || article)) {
            ajouterAuTableau((existante?.article ?? article)!);
            return;
          }
          if (existante) ouvrirComptage(existante);
          else if (article) ouvrirComptage({ article, quantiteTheorique: 0, quantiteReelle: null, motif: null, note: null });
        }}
        options={catalogue.map((a) => ({
          value: a.id,
          label: a.designation,
          meta: joinMeta([a.code, a.unit, dejaListes.has(a.id) && t("déjà dans la liste")]),
          keywords: articleMotsCles(a),
          leading: <ArticleImage src={a.img} alt="" />,
        }))}
      />

      <IonAlert
        isOpen={confirm === "valider"}
        onDidDismiss={() => setConfirm(null)}
        header={t("Valider l'inventaire ?")}
        message={`${
          depot
            ? t("Le stock du dépôt sera remplacé par les {n} quantités comptées.", { n: r?.nbComptes ?? 0 })
            : t("Le stock du camion de {nom} sera remplacé par les {n} quantités comptées.", { nom: inv?.vendeur?.nom ?? "", n: r?.nbComptes ?? 0 })
        }${
          nonComptes > 0 ? ` ${tn(nonComptes, "{n} article non compté garde la quantité de l'app.", "{n} articles non comptés gardent la quantité de l'app.")}` : ""
        } ${t("Cette action est définitive.")}`}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Valider"), handler: valider },
        ]}
      />

      <IonAlert
        isOpen={confirm === "abandonner"}
        onDidDismiss={() => setConfirm(null)}
        header={t("Abandonner l'inventaire ?")}
        message={depot ? t("Les comptages saisis seront supprimés. Le stock du dépôt n'est pas modifié.") : t("Les comptages saisis seront supprimés. Le stock du camion n'est pas modifié.")}
        buttons={[
          { text: t("Continuer l'inventaire"), role: "cancel" },
          { text: t("Abandonner"), role: "destructive", handler: abandonner },
        ]}
      />
    </IonPage>
  );
}
