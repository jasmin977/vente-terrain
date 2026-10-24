import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IonContent, IonIcon, IonPage, useIonViewWillEnter } from "@ionic/react";
import { addOutline, checkmarkCircle, closeOutline, cloudUploadOutline, colorPaletteOutline, createOutline, gridOutline, reorderThreeOutline, saveOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { listArticles } from "../../api/articles";
import { abandonnerBrouillonTouches, enregistrerBrouillonTouches, getTouches, publierTouches } from "../../api/caisse";
import type { Article } from "../../types/article";
import type { FamilleBrouillon, FamilleTouches } from "../../types/caisse";
import { AccountButton, AppHeader, Button, EmptyState, Field, Notice, PageNotice, Sheet, useTriGlisser } from "../../ui";
import ArticlePickerModal from "../ArticlePickerModal";
import ArticleImage from "../../components/ArticleImage";
import { formatAmount } from "../../utils/format";
import { prixTTC } from "../../utils/tarifs";
import { t, tn } from "../../i18n";
import GardeSupermarche from "./GardeSupermarche";

/** Couleurs proposées pour les familles et les touches (lisibles avec un texte blanc) ; toute autre couleur reste possible. */
const COULEURS = ["#2e7d32", "#558b2f", "#00838f", "#0277bd", "#1565c0", "#283593", "#6a1b9a", "#ad1457", "#c62828", "#d84315", "#ef6c00", "#f9a825", "#9e9d24", "#4e342e", "#37474f", "#212121"];

const versBrouillon = (l: FamilleTouches[]): FamilleBrouillon[] =>
  l.map((f) => ({ id: f.id, nom: f.nom, couleur: f.couleur, touches: f.touches.map((x) => ({ articleId: x.articleId, libelle: x.libelle, couleur: x.couleur })) }));
const memes = (a: FamilleBrouillon[] | null, b: FamilleBrouillon[] | null) => JSON.stringify(a) === JSON.stringify(b);

/** Pastilles de couleur, plus le sélecteur libre du navigateur pour une couleur hors palette. */
function Couleurs({ valeur, onChange }: { valeur: string | null; onChange: (c: string) => void }) {
  const libre = valeur && !COULEURS.includes(valeur.toLowerCase());
  return (
    <div className="rc-touches__couleurs" role="radiogroup" aria-label={t("Couleur")}>
      {COULEURS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={c === valeur?.toLowerCase()}
          aria-label={c}
          className={`rc-touches__pastille${c === valeur?.toLowerCase() ? " rc-touches__pastille--active" : ""}`}
          style={{ background: c }}
          onClick={() => onChange(c)}
        />
      ))}
      <label className={`rc-touches__pastille rc-touches__pastille--libre${libre ? " rc-touches__pastille--active" : ""}`} style={libre ? { background: valeur } : undefined} title={t("Autre couleur")}>
        <IonIcon icon={colorPaletteOutline} aria-hidden="true" />
        <input type="color" value={valeur ?? "#000000"} onChange={(e) => onChange(e.target.value)} aria-label={t("Autre couleur")} />
      </label>
    </div>
  );
}

/**
 * Caisse › Touches rapides : familles (bas de l'écran de caisse) et leurs articles, pour passer vite les produits sans
 * étiquette. L'admin range tout (glisser-déposer, couleurs de familles et de groupes de touches), « Enregistrer » garde
 * un brouillon sur le serveur, et seules les modifications « Synchronisées » partent vers les caisses.
 */
export default function CaisseTouches() {
  const [publie, setPublie] = useState<FamilleBrouillon[] | null>(null);
  const [brouillon, setBrouillon] = useState<{ familles: FamilleBrouillon[]; enregistreLe: string } | null>(null);
  const [edition, setEdition] = useState<FamilleBrouillon[] | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [choisie, setChoisie] = useState<string | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set()); // articleId des touches choisies
  const [erreur, setErreur] = useState<string | null>(null);
  const [fiche, setFiche] = useState<FamilleBrouillon | "nouvelle" | null>(null);
  const [nom, setNom] = useState("");
  const [couleur, setCouleur] = useState(COULEURS[0]);
  const [picker, setPicker] = useState(false);
  const [libelleTouche, setLibelleTouche] = useState<{ index: number; texte: string } | null>(null);
  const [enCours, setEnCours] = useState<"enregistrer" | "publier" | "abandonner" | null>(null);

  // Modifications en cours (non enregistrées) : un chargement qui arrive après coup ne doit pas les écraser.
  const enCoursRef = useRef(false);
  const charger = useCallback(async () => {
    try {
      const [r, a] = await Promise.all([getTouches(), listArticles()]);
      const p = versBrouillon(r.publie);
      setPublie(p);
      setBrouillon(r.brouillon);
      setArticles(a);
      if (enCoursRef.current) return;
      // Le brouillon enregistré reprend là où l'admin s'était arrêté.
      const e = r.brouillon?.familles ?? p;
      setEdition(e);
      setChoisie((c) => (c && e.some((x) => x.id === c) ? c : (e[0]?.id ?? null)));
      setErreur(null);
    } catch (err) {
      setPublie([]);
      setEdition([]);
      setErreur(err instanceof ApiError ? err.message : t("Impossible de charger les touches"));
    }
  }, []);
  useEffect(() => {
    void charger();
  }, [charger]);

  const reference = brouillon?.familles ?? publie;
  const nonEnregistre = edition !== null && !memes(edition, reference);
  const aSynchroniser = edition !== null && !memes(edition, publie);

  enCoursRef.current = nonEnregistre;
  // Retour sur la page : rechargé (les modifications en cours sont gardées, voir charger).
  useIonViewWillEnter(() => void charger(), [charger]);

  // Quitter l'onglet avec des modifications non enregistrées : le navigateur demande confirmation.
  useEffect(() => {
    if (!nonEnregistre) return;
    const k = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", k);
    return () => window.removeEventListener("beforeunload", k);
  }, [nonEnregistre]);

  const parId = useMemo(() => new Map(articles.map((a) => [a.id, a])), [articles]);
  const familles = edition ?? [];
  const famille = familles.find((f) => f.id === choisie) ?? null;

  const majFamilles = (fn: (l: FamilleBrouillon[]) => FamilleBrouillon[]) => setEdition((l) => fn(l ?? []));
  const majFamille = (id: string, fn: (f: FamilleBrouillon) => FamilleBrouillon) => majFamilles((l) => l.map((f) => (f.id === id ? fn(f) : f)));
  const majTouches = (fn: (l: FamilleBrouillon["touches"]) => FamilleBrouillon["touches"]) => famille && majFamille(famille.id, (f) => ({ ...f, touches: fn(f.touches) }));

  const triFamilles = useTriGlisser("familles", familles, (l) => setEdition(l));
  const triTouches = useTriGlisser("touches", famille?.touches ?? [], (l) => majTouches(() => l));

  const choisirFamille = (id: string) => {
    setChoisie(id);
    setSelection(new Set());
  };
  const basculer = (articleId: string) =>
    setSelection((s) => {
      const n = new Set(s);
      if (n.has(articleId)) n.delete(articleId);
      else n.add(articleId);
      return n;
    });
  const colorerSelection = (c: string | null) => {
    majTouches((l) => l.map((x) => (selection.has(x.articleId) ? { ...x, couleur: c } : x)));
  };

  const executer = async (quoi: NonNullable<typeof enCours>, fn: () => Promise<void>) => {
    setEnCours(quoi);
    setErreur(null);
    try {
      await fn();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setEnCours(null);
    }
  };
  const enregistrer = () =>
    edition &&
    executer("enregistrer", async () => {
      setBrouillon(await enregistrerBrouillonTouches(edition));
    });
  const synchroniser = () => {
    if (!edition || !window.confirm(t("Envoyer cette disposition à toutes les caisses ? Elles la recevront à leur prochaine synchronisation."))) return;
    void executer("publier", async () => {
      const r = await publierTouches(edition);
      const p = versBrouillon(r.publie);
      // Les familles nouvelles reçoivent leur identifiant définitif : la famille affichée suit par sa position.
      const pos = edition.findIndex((f) => f.id === choisie);
      setPublie(p);
      setEdition(p);
      setBrouillon(null);
      setChoisie(p[pos]?.id ?? p[0]?.id ?? null);
      setSelection(new Set());
    });
  };
  const abandonner = () => {
    if (!window.confirm(t("Abandonner le brouillon et revenir à la disposition actuelle des caisses ?"))) return;
    void executer("abandonner", async () => {
      await abandonnerBrouillonTouches();
      setBrouillon(null);
      setEdition(publie);
      setChoisie((c) => (c && publie?.some((x) => x.id === c) ? c : (publie?.[0]?.id ?? null)));
      setSelection(new Set());
    });
  };

  const ouvrirNouvelle = () => {
    setNom("");
    setCouleur(COULEURS[familles.length % COULEURS.length]);
    setFiche("nouvelle");
  };

  return (
    <IonPage className="rc-page--large">
      <AppHeader large eyebrow={t("Caisse")} title={t("Touches rapides")} actions={<AccountButton />} />
      <IonContent>
        <GardeSupermarche>
          <div className="rc-transfo">
            {erreur && <PageNotice>{erreur}</PageNotice>}

            {/* Enregistrer = brouillon sur le serveur ; Synchroniser = envoi aux caisses. */}
            {edition && (
              <div className="rc-touches__actions">
                <div className="rc-touches__etat">
                  {nonEnregistre ? (
                    <Notice tone="warning">{t("Modifications non enregistrées.")}</Notice>
                  ) : brouillon && aSynchroniser ? (
                    <Notice tone="info" actionLabel={t("Abandonner")} onAction={abandonner}>
                      {t("Brouillon enregistré le {d}, pas encore envoyé aux caisses.", { d: new Date(brouillon.enregistreLe).toLocaleString() })}
                    </Notice>
                  ) : (
                    <span className="rc-touches__a-jour">
                      <IonIcon icon={checkmarkCircle} aria-hidden="true" /> {t("Les caisses ont cette disposition.")}
                    </span>
                  )}
                </div>
                <Button variant="secondary" icon={saveOutline} loading={enCours === "enregistrer"} disabled={!nonEnregistre || enCours !== null} onClick={() => void enregistrer()}>
                  {t("Enregistrer")}
                </Button>
                <Button icon={cloudUploadOutline} loading={enCours === "publier"} disabled={!aSynchroniser || enCours !== null} onClick={synchroniser}>
                  {t("Synchroniser les caisses")}
                </Button>
              </div>
            )}

            {edition && familles.length === 0 ? (
              <EmptyState
                icon={gridOutline}
                title={t("Aucune famille de touches.")}
                message={t("Créez des familles (Fruits, Légumes, Boulangerie…) puis ajoutez-y les articles du catalogue à passer sans scanner.")}
                action={
                  <Button icon={addOutline} onClick={ouvrirNouvelle}>
                    {t("Nouvelle famille")}
                  </Button>
                }
              />
            ) : (
              <div className="rc-touches">
                <aside className="rc-touches__familles" aria-label={t("Familles")}>
                  {familles.map((f, i) => (
                    <div
                      key={f.id}
                      {...triFamilles.element(i)}
                      className={`rc-touches__famille${f.id === choisie ? " rc-touches__famille--active" : ""}${triFamilles.glisse === i ? " rc-touches--glisse" : ""}`}
                      style={{ "--rc-couleur": f.couleur } as React.CSSProperties}
                      role="button"
                      tabIndex={0}
                      onClick={() => choisirFamille(f.id)}
                      onKeyDown={(e) => e.key === "Enter" && choisirFamille(f.id)}
                    >
                      <span className="rc-touches__poignee" {...triFamilles.poignee(i)} aria-label={t("Glisser pour ranger")}>
                        <IonIcon icon={reorderThreeOutline} />
                      </span>
                      <span className="rc-touches__famille-nom">{f.nom}</span>
                      <small>{f.touches.length}</small>
                    </div>
                  ))}
                  <button type="button" className="rc-touches__famille rc-touches__famille--ajout" onClick={ouvrirNouvelle}>
                    <IonIcon icon={addOutline} /> {t("Famille")}
                  </button>
                </aside>

                {famille && (
                  <section className="rc-touches__zone">
                    <div className="rc-touches__barre">
                      <strong style={{ color: famille.couleur }}>{famille.nom}</strong>
                      <span className="rc-footnote">{tn(famille.touches.length, "{n} touche", "{n} touches")}</span>
                      <span className="rc-touches__espace" />
                      <Button
                        variant="ghost"
                        icon={createOutline}
                        onClick={() => {
                          setNom(famille.nom);
                          setCouleur(famille.couleur);
                          setFiche(famille);
                        }}
                      >
                        {t("Nom et couleur")}
                      </Button>
                      <Button icon={addOutline} onClick={() => setPicker(true)}>
                        {t("Ajouter des articles")}
                      </Button>
                    </div>

                    {/* Touches choisies : une couleur pour tout le groupe (ex. fruits en vert, légumes en orange). */}
                    {selection.size > 0 ? (
                      <div className="rc-touches__selection">
                        <strong>{tn(selection.size, "{n} touche choisie", "{n} touches choisies")}</strong>
                        <Couleurs valeur={null} onChange={colorerSelection} />
                        <Button variant="ghost" size="md" onClick={() => colorerSelection(null)}>
                          {t("Couleur de la famille")}
                        </Button>
                        <Button
                          variant="danger"
                          icon={trashOutline}
                          onClick={() => {
                            majTouches((l) => l.filter((x) => !selection.has(x.articleId)));
                            setSelection(new Set());
                          }}
                        >
                          {t("Retirer")}
                        </Button>
                        <Button variant="ghost" icon={closeOutline} onClick={() => setSelection(new Set())}>
                          {t("Annuler")}
                        </Button>
                      </div>
                    ) : (
                      famille.touches.length > 0 && <p className="rc-footnote">{t("Glissez une touche par sa poignée pour la ranger ; touchez des touches pour les choisir et changer leur couleur.")}</p>
                    )}

                    {famille.touches.length === 0 ? (
                      <p className="rc-footnote rc-touches__vide">{t("Aucun article : ajoutez ceux que les caissiers passent sans scanner.")}</p>
                    ) : (
                      <ul className="rc-touches__grille">
                        {famille.touches.map((x, i) => {
                          const a = parId.get(x.articleId);
                          const choisieT = selection.has(x.articleId);
                          return (
                            <li
                              key={x.articleId}
                              {...triTouches.element(i)}
                              className={`rc-touches__touche${choisieT ? " rc-touches__touche--choisie" : ""}${triTouches.glisse === i ? " rc-touches--glisse" : ""}`}
                              style={{ "--rc-couleur": x.couleur ?? famille.couleur } as React.CSSProperties}
                              onClick={() => basculer(x.articleId)}
                            >
                              <span className="rc-touches__poignee" {...triTouches.poignee(i)} aria-label={t("Glisser pour ranger")}>
                                <IonIcon icon={reorderThreeOutline} />
                              </span>
                              {choisieT && <IonIcon className="rc-touches__coche" icon={checkmarkCircle} aria-hidden="true" />}
                              <ArticleImage src={a?.img ?? null} alt="" size={40} />
                              <span className="rc-touches__nom">{x.libelle || a?.designation || t("Article supprimé")}</span>
                              {a && <span className="rc-touches__prix">{formatAmount(prixTTC(a))}</span>}
                              <button
                                type="button"
                                className="rc-touches__libelle"
                                aria-label={t("Libellé de la touche")}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLibelleTouche({ index: i, texte: x.libelle ?? "" });
                                }}
                              >
                                <IonIcon icon={createOutline} />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                )}
              </div>
            )}
          </div>

          {/* Famille : nom et couleur (gardés dans le brouillon). */}
          <Sheet
            isOpen={fiche !== null}
            title={fiche === "nouvelle" ? t("Nouvelle famille") : t("Modifier la famille")}
            height="auto"
            onDismiss={() => setFiche(null)}
            footer={
              <Button
                size="lg"
                block
                disabled={!nom.trim()}
                onClick={() => {
                  if (fiche === "nouvelle") {
                    const id = `nouvelle-${Date.now()}`;
                    majFamilles((l) => [...l, { id, nom: nom.trim(), couleur, touches: [] }]);
                    choisirFamille(id);
                  } else if (fiche) majFamille(fiche.id, (f) => ({ ...f, nom: nom.trim(), couleur }));
                  setFiche(null);
                }}
              >
                {fiche === "nouvelle" ? t("Créer la famille") : t("Valider")}
              </Button>
            }
          >
            <div className="rc-fields rc-sheet__form">
              <Field label={t("Nom")} value={nom} onChange={setNom} maxLength={40} placeholder={t("ex : Fruits, Légumes, Boulangerie")} />
              <div className="rc-field">
                <span className="rc-field__label">{t("Couleur")}</span>
                <Couleurs valeur={couleur} onChange={setCouleur} />
              </div>
              {fiche && fiche !== "nouvelle" && (
                <Button
                  variant="danger"
                  icon={trashOutline}
                  onClick={() => {
                    if (!window.confirm(t("Supprimer la famille « {n} » et ses touches ?", { n: fiche.nom }))) return;
                    const reste = familles.filter((f) => f.id !== fiche.id);
                    setEdition(reste);
                    choisirFamille(reste[0]?.id ?? "");
                    setFiche(null);
                  }}
                >
                  {t("Supprimer la famille")}
                </Button>
              )}
            </div>
          </Sheet>

          {/* Libellé court affiché sur la touche (sinon la désignation de l'article). */}
          <Sheet
            isOpen={libelleTouche !== null}
            title={t("Libellé de la touche")}
            height="auto"
            onDismiss={() => setLibelleTouche(null)}
            footer={
              <Button
                size="lg"
                block
                onClick={() => {
                  if (!libelleTouche) return;
                  majTouches((l) => l.map((x, i) => (i === libelleTouche.index ? { ...x, libelle: libelleTouche.texte.trim() || null } : x)));
                  setLibelleTouche(null);
                }}
              >
                {t("Valider")}
              </Button>
            }
          >
            <div className="rc-fields rc-sheet__form">
              {famille && libelleTouche && <Notice tone="info">{parId.get(famille.touches[libelleTouche.index]?.articleId)?.designation}</Notice>}
              <Field
                label={t("Libellé")}
                value={libelleTouche?.texte ?? ""}
                maxLength={40}
                onChange={(v) => setLibelleTouche((x) => (x ? { ...x, texte: v } : x))}
                hint={t("Vide : la désignation de l'article.")}
              />
            </div>
          </Sheet>

          <ArticlePickerModal
            isOpen={picker}
            articles={articles}
            selectedIds={famille?.touches.map((x) => x.articleId) ?? []}
            title={t("Articles de la famille")}
            confirmLabel={t("Valider")}
            onDismiss={() => setPicker(false)}
            onConfirm={(ids) => {
              setPicker(false);
              // Garde l'ordre, les libellés et les couleurs des touches existantes, ajoute les nouvelles à la fin.
              majTouches((l) => {
                const actuelles = l.filter((x) => ids.includes(x.articleId));
                const nouvelles = ids.filter((id) => !actuelles.some((x) => x.articleId === id)).map((articleId) => ({ articleId, libelle: null, couleur: null }));
                return [...actuelles, ...nouvelles];
              });
              setSelection(new Set());
            }}
          />
        </GardeSupermarche>
      </IonContent>
    </IonPage>
  );
}
