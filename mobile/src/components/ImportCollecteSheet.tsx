import { useEffect, useMemo, useState } from "react";
import { arrowBackOutline, cloudDownloadOutline, phonePortraitOutline, refreshOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { listArticles } from "../api/articles";
import type { Article } from "../types/article";
import ArticlePickerModal from "../pages/ArticlePickerModal";
import { getCollecte, listCollectes, marquerCollecteImportee, type CollecteDetail, type CollecteResume } from "../api/collectes";
import { Button, EmptyState, Notice, PageNotice, Sheet, Spinner } from "../ui";
import { formatDateTime } from "../utils/format";
import { t, tn } from "../i18n";

export interface LigneImportee {
  articleId: string;
  quantite: number;
}

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  /** Où la collecte est mise (gardé sur la collecte, affiché sur le PDA) : « BL fournisseur », « B° Entrée »… */
  destination: string;
  /**
   * Ajoute les articles reconnus au formulaire. Renvoie le nombre de lignes que le formulaire n'a pas pu prendre
   * (article absent de sa liste), pour le signaler.
   */
  onImporter: (lignes: LigneImportee[]) => number | Promise<number>;
}

/**
 * « Télécharger depuis le PDA » : choisir UNE collecte terminée sur le PDA, voir ses articles (et les codes inconnus),
 * puis l'importer dans le formulaire. Une collecte importée n'est plus proposée.
 */
export default function ImportCollecteSheet({ isOpen, onDismiss, destination, onImporter }: Props) {
  const [collectes, setCollectes] = useState<CollecteResume[] | null>(null);
  const [detail, setDetail] = useState<CollecteDetail | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Codes inconnus rattachés à la main à un article (code-barres → article) ; la quantité scannée est gardée.
  const [choix, setChoix] = useState<Map<string, string>>(new Map());
  const [catalogue, setCatalogue] = useState<Article[] | null>(null);
  const [aRattacher, setARattacher] = useState<string | null>(null);
  const articleParId = useMemo(() => new Map((catalogue ?? []).map((a) => [a.id, a])), [catalogue]);

  const charger = () => {
    setCollectes(null);
    setErreur(null);
    listCollectes()
      .then(setCollectes)
      .catch((err) => {
        setCollectes([]);
        setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les collectes"));
      });
  };

  useEffect(() => {
    if (!isOpen) return;
    setDetail(null);
    charger();
  }, [isOpen]);

  useEffect(() => {
    setChoix(new Map());
  }, [detail]);

  // Catalogue chargé seulement s'il y a des codes inconnus à rattacher.
  useEffect(() => {
    if (detail?.lignes.some((l) => !l.articleId) && catalogue === null) listArticles().then(setCatalogue).catch(() => setCatalogue([]));
  }, [detail, catalogue]);

  const ouvrir = async (c: CollecteResume) => {
    setErreur(null);
    setEnCours(true);
    try {
      setDetail(await getCollecte(c.id));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger la collecte"));
    } finally {
      setEnCours(false);
    }
  };

  const importer = async () => {
    if (!detail) return;
    setEnCours(true);
    setErreur(null);
    try {
      // Même article par deux codes (code connu + code rattaché) : quantités additionnées.
      const parArticle = new Map<string, number>();
      for (const l of detail.lignes) {
        const articleId = l.articleId ?? choix.get(l.codeBarre);
        if (articleId) parArticle.set(articleId, (parArticle.get(articleId) ?? 0) + l.quantite);
      }
      const refusees = await onImporter([...parArticle].map(([articleId, quantite]) => ({ articleId, quantite })));
      await marquerCollecteImportee(detail.id, destination);
      if (refusees > 0) setErreur(tn(refusees, "{n} article n'a pas pu être ajouté à ce formulaire.", "{n} articles n'ont pas pu être ajoutés à ce formulaire."));
      else onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Import impossible"));
    } finally {
      setEnCours(false);
    }
  };

  const reconnues = detail?.lignes.filter((l) => l.articleId || choix.has(l.codeBarre)) ?? [];
  const nonRattachees = detail?.lignes.filter((l) => !l.articleId && !choix.has(l.codeBarre)) ?? [];

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={detail ? detail.nom || t("Collecte du {d}", { d: formatDateTime(detail.termineeLe) }) : t("Télécharger depuis le PDA")}
        large
        onDismiss={onDismiss}
        footer={
          detail && (
            <div className="rc-achat__pied rc-achat__pied--actions">
              <Button variant="ghost" icon={arrowBackOutline} onClick={() => setDetail(null)}>
                {t("Autres collectes")}
              </Button>
              <Button size="lg" icon={cloudDownloadOutline} loading={enCours} disabled={reconnues.length === 0} onClick={importer}>
                {tn(reconnues.length, "Importer {n} article", "Importer {n} articles")}
              </Button>
            </div>
          )
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}

          {!detail ? (
            collectes === null ? (
              <Spinner />
            ) : collectes.length === 0 ? (
              <EmptyState
                icon={phonePortraitOutline}
                title={t("Aucune collecte reçue.")}
                message={t("Sur le PDA, ouvrez Scan Stock, scannez les articles puis touchez « Envoyer au PC ».")}
                action={
                  <Button variant="secondary" icon={refreshOutline} onClick={charger}>
                    {t("Actualiser")}
                  </Button>
                }
              />
            ) : (
              <>
                <div className="rc-achat__barre">
                  <span className="rc-footnote">{t("Choisissez la collecte à mettre dans ce formulaire. Une collecte se réimporte autant de fois que voulu ; elle se supprime depuis le PDA.")}</span>
                  <Button variant="ghost" icon={refreshOutline} onClick={charger}>
                    {t("Actualiser")}
                  </Button>
                </div>
                <ul className="rc-collecte__liste">
                  {collectes.map((c) => (
                    <li key={c.id}>
                      <button type="button" className="rc-collecte__choix" disabled={enCours} onClick={() => ouvrir(c)}>
                        <strong>{c.nom || t("Collecte sans nom")}</strong>
                        <span>
                          {c.user?.nom ?? c.appareil ?? t("Scan Stock")} · {formatDateTime(c.termineeLe)}
                        </span>
                        <span>
                          {tn(c.nbLignes, "{n} article", "{n} articles")} · {tn(Number(c.totalQuantite.toFixed(3)), "{n} pièce", "{n} pièces")}
                        </span>
                        {c.nbImports ? (
                          <span className="rc-collecte__deja">
                            {tn(c.nbImports, "Déjà importée {n} fois", "Déjà importée {n} fois")}
                            {c.importeeDans ? ` · ${t("dernière : {d}", { d: c.importeeDans })}` : ""}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )
          ) : (
            <>
              <p className="rc-footnote">
                {detail.user?.nom ?? detail.appareil ?? t("Scan Stock")} · {formatDateTime(detail.termineeLe)}
              </p>
              {nonRattachees.length > 0 && (
                <Notice tone="warning">
                  {tn(
                    nonRattachees.length,
                    "{n} code inconnu : choisissez son article dans le tableau, sinon il n'est pas importé (il reste dans la collecte).",
                    "{n} codes inconnus : choisissez leur article dans le tableau, sinon ils ne sont pas importés (ils restent dans la collecte)."
                  )}
                </Notice>
              )}
              <div className="rc-tdonnees">
                <table aria-label={t("Articles de la collecte")}>
                  <thead>
                    <tr>
                      <th scope="col">{t("Code-barres")}</th>
                      <th scope="col">{t("Article")}</th>
                      <th scope="col" style={{ textAlign: "end" }}>
                        {t("Quantité")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lignes.map((l) => (
                      <tr key={l.codeBarre} className={l.articleId || choix.has(l.codeBarre) ? undefined : "rc-tdonnees__ligne--attenuee"}>
                        <td>{l.codeBarre}</td>
                        <td className="rc-tdonnees__principale rc-tdonnees__souple">
                          {l.articleId ? (
                            l.designation
                          ) : (
                            <Button variant={choix.has(l.codeBarre) ? "ghost" : "secondary"} disabled={catalogue === null} onClick={() => setARattacher(l.codeBarre)}>
                              {choix.has(l.codeBarre) ? articleParId.get(choix.get(l.codeBarre)!)?.designation ?? t("Article") : t("Code inconnu · choisir l'article")}
                            </Button>
                          )}
                        </td>
                        <td style={{ textAlign: "end" }}>{Number(l.quantite.toFixed(3))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </Sheet>
      <ArticlePickerModal
        isOpen={aRattacher !== null}
        articles={catalogue ?? []}
        selectedIds={[]}
        title={t("Article du code {code}", { code: aRattacher ?? "" })}
        confirmLabel={t("Choisir")}
        onDismiss={() => setARattacher(null)}
        onConfirm={(ids) => {
          const code = aRattacher;
          setARattacher(null);
          if (!code) return;
          setChoix((m) => {
            const n = new Map(m);
            if (ids[0]) n.set(code, ids[0]);
            else n.delete(code);
            return n;
          });
        }}
      />
    </>
  );
}
