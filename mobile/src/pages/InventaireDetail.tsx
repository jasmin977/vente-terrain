import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage } from "@ionic/react";
import { addOutline, checkmarkDoneOutline, searchOutline, trashOutline } from "ionicons/icons";
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
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import InventaireCountSheet, { type LigneACompter } from "./InventaireCountSheet";
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
} from "../ui";
import { t, tn } from "../i18n";

type Filtre = "a_compter" | "comptes" | "ecarts" | "tous";

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
    });
  }, [charger]);

  const enCours = inv?.statut === "EN_COURS";
  const lignes = useMemo(() => inv?.lignes ?? [], [inv]);
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
      if (enCours) ouvrirComptage(l);
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
        ouvrirComptage({ article, quantiteTheorique: 0, quantiteReelle: null, motif: null, note: null });
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

  return (
    <IonPage>
      <AppHeader
        backHref="/inventaires"
        title={inv ? t("Camion de {nom}", { nom: inv.vendeur.nom }) : t("Inventaire")}
        eyebrow={inv ? t("Inventaire · {date}", { date: formatDateTime(inv.statut === "VALIDE" ? inv.dateValidation ?? inv.createdAt : inv.createdAt) }) : undefined}
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
              <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, code…")} />
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
                  message={filtre === "a_compter" && !q ? t("Validez l'inventaire pour mettre à jour le stock du camion.") : undefined}
                />
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
              </Section>
            )}

            {!enCours && (
              <Section>
                <p className="rc-footnote">
                  {t("Stock du camion remplacé par les quantités comptées le {date} par {admin}. Valeur du manque calculée au prix de vente ({m} TND).", {
                    date: formatDateTime(inv.dateValidation ?? inv.createdAt),
                    admin: inv.admin.nom,
                    m: formatAmount(r.valeurManque),
                  })}
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

      {inv && enCours && r && (
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
        title={t("Article trouvé dans le camion")}
        searchPlaceholder={t("Désignation, marque, code…")}
        emptyLabel={t("Aucun article trouvé.")}
        onDismiss={() => setAjoutOpen(false)}
        onScan={(code) => articleParCode(catalogue, code)?.id}
        onSelect={(articleId) => {
          setAjoutOpen(false);
          const existante = lignes.find((l) => l.articleId === articleId);
          const article = catalogue.find((a) => a.id === articleId);
          if (existante) ouvrirComptage(existante);
          else if (article) ouvrirComptage({ article, quantiteTheorique: 0, quantiteReelle: null, motif: null, note: null });
        }}
        options={catalogue.map((a) => ({
          value: a.id,
          label: a.designation,
          meta: dejaListes.has(a.id) ? t("{code} · déjà dans la liste", { code: a.code }) : a.code,
          keywords: articleMotsCles(a),
          leading: <ArticleImage src={a.img} alt="" />,
        }))}
      />

      <IonAlert
        isOpen={confirm === "valider"}
        onDidDismiss={() => setConfirm(null)}
        header={t("Valider l'inventaire ?")}
        message={`Le stock du camion de ${inv?.vendeur.nom ?? ""} sera remplacé par les ${r?.nbComptes ?? 0} quantités comptées.${
          nonComptes > 0 ? ` ${tn(nonComptes, "{n} article non compté garde la quantité de l'app.", "{n} articles non comptés gardent la quantité de l'app.")}` : ""
        } Cette action est définitive.`}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          { text: t("Valider"), handler: valider },
        ]}
      />

      <IonAlert
        isOpen={confirm === "abandonner"}
        onDidDismiss={() => setConfirm(null)}
        header={t("Abandonner l'inventaire ?")}
        message={t("Les comptages saisis seront supprimés. Le stock du camion n'est pas modifié.")}
        buttons={[
          { text: t("Continuer l'inventaire"), role: "cancel" },
          { text: t("Abandonner"), role: "destructive", handler: abandonner },
        ]}
      />
    </IonPage>
  );
}
