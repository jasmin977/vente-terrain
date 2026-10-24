import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage } from "@ionic/react";
import { addOutline, closeOutline, giftOutline, saveOutline, stopCircleOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../api/client";
import { listArticles } from "../api/articles";
import { arreterPromotion, creerPromotion, getPromotion, modifierPromotion, supprimerPromotion } from "../api/promotions";
import type { Article } from "../types/article";
import type { ArticlePromo, LignePromotion, ModeLot, Promotion, TypePromotion } from "../types/promotion";
import { useAuth } from "../auth/AuthContext";
import ArticlePickerModal from "./ArticlePickerModal";
import PromotionResultats from "../components/PromotionResultats";
import { ActionBar, AppHeader, Button, EmptyState, Field, IconButton, Money, PageNotice, Section, Segmented, SkeletonList, Tag } from "../ui";
import { LIBELLES_MODE, STATUTS_PROMO, gainPromo, margePromo, prixPlancherTTC, venteTTC } from "../utils/promotions";
import { arrondir, htDepuisTTC, margeDepuis, ttcDepuisHT } from "../utils/tarifs";
import { toLocalDateString } from "../utils/format";
import { t } from "../i18n";

/** Ligne en cours de saisie : les prix sont tapés TTC (convertis en HT à l'enregistrement). */
interface LigneSaisie extends LignePromotion {
  article: ArticlePromo;
  prixTTC?: string;
  lotTTC?: string;
}

const MODES: ModeLot[] = ["CADEAU", "UN_PLUS_UN", "DEUXIEME_MOITIE", "N_PLUS_UN", "PRIX_LOT"];
const num = (v: string | number | null | undefined) => Number(String(v ?? "").replace(",", ".")) || 0;
const tva = (a: ArticlePromo) => Number(a.tva) || 0;
const fodec = (a: ArticlePromo) => Number(a.fodec ?? 0) || 0;

function Marge({ valeur }: { valeur: number | undefined }) {
  if (valeur === undefined) return <span className="rc-promo__vide">—</span>;
  const classe = valeur < 0 ? " rc-marge--negative" : valeur < 10 ? " rc-marge--faible" : "";
  return <span className={`rc-marge${classe}`}>{valeur.toFixed(2)} %</span>;
}

/** Ce que rapporte une pièce (HT) : vert si gain, rouge si perte. */
function Gain({ valeur }: { valeur: number | undefined }) {
  if (valeur === undefined) return <span className="rc-promo__vide">—</span>;
  return (
    <span className={`rc-promo__gain${valeur < 0 ? " rc-promo__gain--perte" : ""}`}>
      {valeur > 0 ? "+" : valeur < 0 ? "−" : ""}
      {Math.abs(valeur).toFixed(3)} <small>TND</small>
    </span>
  );
}

/**
 * Promotion (création ou modification) : en-tête (période, libellé, mode du lot) puis les articles. Prix promo :
 * prix d'achat récent, prix de vente actuel, marge actuelle, nouveau prix et sa marge. Vente en lot : les
 * réglages du mode choisi par article, et la marge qui en résulte.
 */
export default function PromotionForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { search } = useLocation();
  const nouvelle = id === "nouvelle";

  const [promo, setPromo] = useState<Promotion | null>(null);
  const [type, setType] = useState<TypePromotion>(() => (new URLSearchParams(search).get("type") === "LOT" ? "LOT" : "PRIX"));
  const [mode, setMode] = useState<ModeLot>("UN_PLUS_UN");
  const [libelle, setLibelle] = useState("");
  const aujourdhui = toLocalDateString(new Date());
  const [dateDebut, setDateDebut] = useState(aujourdhui);
  const [dateFin, setDateFin] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return toLocalDateString(d);
  });
  const [lignes, setLignes] = useState<LigneSaisie[]>([]);
  const [catalogue, setCatalogue] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [picker, setPicker] = useState<{ pour: "lignes" } | { pour: "offert"; articleId: string } | null>(null);
  const [code, setCode] = useState("");
  const [confirmer, setConfirmer] = useState<"supprimer" | "arreter" | null>(null);
  // Promotion enregistrée : ses articles, ou ses résultats (ventes avant / pendant).
  const [onglet, setOnglet] = useState<"articles" | "resultats">("articles");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const [arts, p] = await Promise.all([listArticles(), nouvelle ? Promise.resolve(null) : getPromotion(id!)]);
        if (annule) return;
        setCatalogue(arts);
        if (p) {
          setPromo(p);
          setType(p.type);
          if (p.mode) setMode(p.mode);
          setLibelle(p.libelle ?? "");
          setDateDebut(p.dateDebut);
          setDateFin(p.dateFin);
          setLignes(
            p.lignes.map((l) => ({
              ...l,
              article: l.article!,
              prixTTC: l.prixPromo ? ttcDepuisHT(l.prixPromo, tva(l.article!), fodec(l.article!)).toFixed(3) : "",
              lotTTC: l.prixLot ? ttcDepuisHT(l.prixLot, tva(l.article!), fodec(l.article!)).toFixed(3) : "",
            })),
          );
        }
      } catch (err) {
        if (!annule) setErreur(err instanceof ApiError ? err.message : t("Impossible de charger la promotion"));
      } finally {
        if (!annule) setChargement(false);
      }
    })();
    return () => {
      annule = true;
    };
  }, [id, nouvelle]);

  const parId = useMemo(() => new Map(catalogue.map((a) => [a.id, a])), [catalogue]);
  const versPromo = (a: Article): ArticlePromo => ({ id: a.id, designation: a.designation, codeBarre: a.codeBarre, prixAchat: a.prixAchat ?? 0, prixVente: a.prixVente, tva: a.tva, fodec: a.fodec, colisage: a.colisage, img: a.img });

  const ajouterArticles = (ids: string[]) => {
    setLignes((l) => {
      const deja = new Set(l.map((x) => x.articleId));
      const nouveaux = ids.filter((i) => !deja.has(i) && parId.has(i)).map((i): LigneSaisie => ({ articleId: i, article: versPromo(parId.get(i)!), quantiteOfferte: 1, seuil: 2, tailleLot: 10 }));
      return [...l, ...nouveaux];
    });
  };
  const ajouterParCode = () => {
    const c = code.trim();
    if (!c) return;
    const a = catalogue.find((x) => x.codeBarre === c || x.code === c || x.codesBarres?.some((cb) => cb.codeBarre === c));
    if (!a) return setErreur(t("Aucun article pour le code {c}.", { c }));
    setErreur(null);
    ajouterArticles([a.id]);
    setCode("");
  };
  const maj = (articleId: string, patch: Partial<LigneSaisie>) => setLignes((l) => l.map((x) => (x.articleId === articleId ? { ...x, ...patch } : x)));
  // Saisie au clavier : Entrée ou ↓ passe à la même case de la ligne suivante, ↑ à la précédente.
  const naviguerSaisie = (e: React.KeyboardEvent<HTMLTableElement>) => {
    const champ = e.target as unknown as HTMLInputElement;
    const col = champ.dataset?.col;
    if (!col || !["Enter", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    e.preventDefault();
    const champs = Array.from(e.currentTarget.querySelectorAll<HTMLInputElement>(`input[data-col="${col}"]`));
    const i = champs.indexOf(champ);
    const suivant = champs[i + (e.key === "ArrowUp" ? -1 : 1)];
    if (suivant) suivant.focus();
    else if (e.key === "Enter") champ.blur();
  };
  // Une case qui prend le focus a son contenu sélectionné : on tape directement le nouveau prix.
  const selectionnerSaisie = (e: React.FocusEvent<HTMLTableElement>) => {
    const champ = e.target as unknown as HTMLInputElement;
    if (champ.dataset?.col) champ.select();
  };
  // Prix : à la sortie de la case, 2.5 devient 2.500 (trois décimales, virgule acceptée).
  const formaterSaisie = (e: React.FocusEvent<HTMLTableElement>) => {
    const champ = e.target as unknown as HTMLInputElement;
    const col = champ.dataset?.col;
    const articleId = champ.dataset?.article;
    if ((col !== "prix" && col !== "lot") || !articleId || !champ.value.trim()) return;
    const v = num(champ.value);
    if (!(v > 0)) return;
    maj(articleId, col === "prix" ? { prixTTC: v.toFixed(3) } : { lotTTC: v.toFixed(3) });
  };
  const retirer = (articleId: string) => setLignes((l) => l.filter((x) => x.articleId !== articleId));

  // Valeurs HT pour le calcul des marges et l'enregistrement.
  const avecHT = (l: LigneSaisie): LigneSaisie => ({
    ...l,
    prixPromo: l.prixTTC ? htDepuisTTC(num(l.prixTTC), tva(l.article), fodec(l.article)) : null,
    prixLot: l.lotTTC ? htDepuisTTC(num(l.lotTTC), tva(l.article), fodec(l.article)) : null,
  });
  const modeCalcul = type === "PRIX" ? "PRIX" : mode;

  const manque = (() => {
    if (!dateDebut || !dateFin) return t("Choisissez la période");
    if (dateFin < dateDebut) return t("La date de fin est avant la date de début");
    if (lignes.length === 0) return t("Ajoutez au moins un article");
    for (const l of lignes) {
      if (modeCalcul === "PRIX" && !(num(l.prixTTC) > 0)) return t("Prix promo manquant : {a}", { a: l.article.designation });
      if (modeCalcul === "CADEAU" && (!l.articleOffertId || !(num(l.quantiteOfferte) > 0))) return t("Article offert manquant : {a}", { a: l.article.designation });
      if (modeCalcul === "N_PLUS_UN" && !(num(l.seuil) >= 1)) return t("N manquant : {a}", { a: l.article.designation });
      if (modeCalcul === "PRIX_LOT" && (!(num(l.tailleLot) >= 2) || !(num(l.lotTTC) > 0))) return t("Taille ou prix du lot manquant : {a}", { a: l.article.designation });
    }
    return null;
  })();

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const input = {
        type,
        mode: type === "LOT" ? mode : null,
        libelle: libelle.trim() || null,
        dateDebut,
        dateFin,
        lignes: lignes.map((l0) => {
          const l = avecHT(l0);
          return {
            articleId: l.articleId,
            prixPromo: modeCalcul === "PRIX" ? l.prixPromo : null,
            articleOffertId: modeCalcul === "CADEAU" ? l.articleOffertId : null,
            quantiteOfferte: modeCalcul === "CADEAU" ? num(l.quantiteOfferte) : null,
            seuil: modeCalcul === "N_PLUS_UN" ? Math.round(num(l.seuil)) : null,
            tailleLot: modeCalcul === "PRIX_LOT" ? Math.round(num(l.tailleLot)) : null,
            prixLot: modeCalcul === "PRIX_LOT" ? l.prixLot : null,
          };
        }),
      };
      const p = promo ? await modifierPromotion(promo.id, input) : await creerPromotion(input);
      navigate(`/promotions/${p.id}`, { replace: true });
      setPromo(p);
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'enregistrer la promotion"));
    } finally {
      setEnCours(false);
    }
  };

  if (user && user.role !== "ADMIN") return <Navigate to="/factures" replace />;

  const titre = promo ? `${promo.numero}${promo.libelle ? ` · ${promo.libelle}` : ""}` : type === "PRIX" ? t("Nouvelle promotion de prix") : t("Nouvelle vente en lot");

  // Colonnes propres au mode, après Article · Achat TTC · Vente TTC (tout sur la même base, taxes comprises).
  const enteteMode =
    modeCalcul === "PRIX"
      ? [t("Marge actuelle"), t("Prix promo TTC"), t("Gain / pièce"), t("Marge promo")]
      : modeCalcul === "CADEAU"
        ? [t("Article offert"), t("Qté offerte"), t("Gain / pièce"), t("Marge")]
        : modeCalcul === "N_PLUS_UN"
          ? [t("N achetés"), t("Offerte"), t("Gain / pièce"), t("Marge")]
          : modeCalcul === "PRIX_LOT"
            ? [t("Pièces du lot"), t("Prix du lot TTC"), t("Gain / pièce"), t("Marge")]
            : [t("Marge actuelle"), t("Effet"), t("Gain / pièce"), t("Marge")];

  return (
    <IonPage className="rc-page--large">
      <AppHeader backHref="/promotions" eyebrow={type === "PRIX" ? t("Promotion de prix") : t("Vente en lot")} title={titre} />
      <IonContent>
        {chargement ? (
          <SkeletonList rows={6} />
        ) : (
          <div className="rc-promo">
            {erreur && <PageNotice>{erreur}</PageNotice>}

            <section className="rc-promo__entete">
              <div className="rc-promo__infos">
                {promo ? (
                  <Tag tone={STATUTS_PROMO[promo.statut].ton} dot>
                    {t(STATUTS_PROMO[promo.statut].texte)}
                  </Tag>
                ) : (
                  <Tag tone="info">{t("N° attribué à l'enregistrement")}</Tag>
                )}
              </div>
              <div className="rc-promo__champs">
                <Field label={t("Libellé")} value={libelle} onChange={setLibelle} placeholder={t("ex. Promo fromages de novembre")} />
                <Field label={t("Du")} type="date" value={dateDebut} max={dateFin || undefined} onChange={(v) => setDateDebut(v || aujourdhui)} />
                <Field label={t("Au")} type="date" value={dateFin} min={dateDebut || undefined} onChange={(v) => setDateFin(v)} />
              </div>
              {type === "LOT" && (
                <div className="rc-promo__modes" role="radiogroup" aria-label={t("Mode")}>
                  {MODES.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} className={`rc-promo__mode${mode === m ? " rc-promo__mode--actif" : ""}`} onClick={() => setMode(m)}>
                      <strong>{t(LIBELLES_MODE[m].titre)}</strong>
                      <span>{t(LIBELLES_MODE[m].exemple)}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>

            {promo && (
              <Segmented
                label={t("Affichage")}
                variant="onglets"
                value={onglet}
                onChange={setOnglet}
                options={[
                  { value: "articles", label: t("Articles") },
                  { value: "resultats", label: t("Résultats") },
                ]}
              />
            )}

            {promo && onglet === "resultats" ? (
              <PromotionResultats promotionId={promo.id} />
            ) : (
            <Section
              label={t("Articles")}
              aside={
                <span className="rc-promo__ajout">
                  <Field
                    label={t("Code-barres")}
                    hideLabel
                    value={code}
                    onChange={setCode}
                    placeholder={t("Scanner un code-barres…")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        ajouterParCode();
                      }
                    }}
                  />
                  <Button variant="secondary" icon={addOutline} onClick={() => setPicker({ pour: "lignes" })}>
                    {t("Ajouter des articles")}
                  </Button>
                </span>
              }
            >
              {lignes.length === 0 ? (
                <EmptyState icon={giftOutline} title={t("Aucun article.")} message={t("Ajoutez les articles de la promotion (liste ou douchette).")} />
              ) : (
                <div className="rc-tdonnees rc-promo__table">
                  <table aria-label={t("Articles de la promotion")} onKeyDown={naviguerSaisie} onFocus={selectionnerSaisie} onBlur={formaterSaisie}>
                    <thead>
                      <tr>
                        <th scope="col">{t("Article")}</th>
                        <th scope="col" className="rc-promo__num">
                          {t("Achat TTC")}
                        </th>
                        <th scope="col" className="rc-promo__num">
                          {t("Vente TTC")}
                        </th>
                        {enteteMode.map((e) => (
                          <th key={e} scope="col" className="rc-promo__num">
                            {e}
                          </th>
                        ))}
                        <th scope="col" aria-label={t("Retirer")} />
                      </tr>
                    </thead>
                    <tbody>
                      {lignes.map((l0) => {
                        const l = avecHT(l0);
                        const a = l.article;
                        const actuelle = margeDepuis(Number(a.prixVente), Number(a.prixAchat));
                        const offert = l.articleOffertId ? parId.get(l.articleOffertId) : undefined;
                        const ligneCalcul = { ...l, articleOffert: offert ? versPromo(offert) : l.articleOffert };
                        return (
                          <tr key={l.articleId}>
                            <td className="rc-tdonnees__principale rc-tdonnees__souple">
                              <strong>{a.designation}</strong>
                              {a.codeBarre && <small className="rc-promo__code">{a.codeBarre}</small>}
                            </td>
                            <td className="rc-promo__num">
                              {prixPlancherTTC(a) !== undefined ? <Money value={prixPlancherTTC(a)!} /> : "—"}
                            </td>
                            <td className="rc-promo__num">
                              <Money value={venteTTC(a)} />
                            </td>
                            {modeCalcul === "PRIX" ? (
                              <>
                                <td className="rc-promo__num">
                                  <Marge valeur={actuelle} />
                                </td>
                                <td className={`rc-promo__num${prixPlancherTTC(a) !== undefined && num(l0.prixTTC) > 0 && num(l0.prixTTC) < prixPlancherTTC(a)! ? " rc-promo__sous-plancher" : ""}`}>
                                  <input className="rc-promo__saisie" data-col="prix" data-article={l.articleId} inputMode="decimal" value={l0.prixTTC ?? ""} placeholder="0.000" onChange={(e) => maj(l.articleId, { prixTTC: e.target.value })} aria-label={t("Prix promo TTC de {a}", { a: a.designation })} />
                                </td>
                              </>
                            ) : modeCalcul === "CADEAU" ? (
                              <>
                                <td className="rc-promo__num">
                                  <button type="button" className="rc-promo__choix" onClick={() => setPicker({ pour: "offert", articleId: l.articleId })}>
                                    {offert?.designation ?? l.articleOffert?.designation ?? t("Choisir…")}
                                  </button>
                                </td>
                                <td className="rc-promo__num">
                                  <input className="rc-promo__saisie rc-promo__saisie--court" data-col="offerte" inputMode="decimal" value={l0.quantiteOfferte ?? ""} onChange={(e) => maj(l.articleId, { quantiteOfferte: num(e.target.value) || null })} aria-label={t("Quantité offerte")} />
                                </td>
                              </>
                            ) : modeCalcul === "N_PLUS_UN" ? (
                              <>
                                <td className="rc-promo__num">
                                  <input className="rc-promo__saisie rc-promo__saisie--court" data-col="seuil" inputMode="numeric" value={l0.seuil ?? ""} onChange={(e) => maj(l.articleId, { seuil: Math.round(num(e.target.value)) || null })} aria-label={t("Pièces achetées (N)")} />
                                </td>
                                <td className="rc-promo__num rc-promo__effet">{l0.seuil ? t("{n} + 1 offerte", { n: l0.seuil }) : "—"}</td>
                              </>
                            ) : modeCalcul === "PRIX_LOT" ? (
                              <>
                                <td className="rc-promo__num">
                                  <input className="rc-promo__saisie rc-promo__saisie--court" data-col="taille" inputMode="numeric" value={l0.tailleLot ?? ""} onChange={(e) => maj(l.articleId, { tailleLot: Math.round(num(e.target.value)) || null })} aria-label={t("Pièces du lot")} />
                                </td>
                                <td className="rc-promo__num">
                                  <input className="rc-promo__saisie" data-col="lot" data-article={l.articleId} inputMode="decimal" value={l0.lotTTC ?? ""} placeholder={l0.tailleLot ? (venteTTC(a) * l0.tailleLot).toFixed(3) : "0.000"} onChange={(e) => maj(l.articleId, { lotTTC: e.target.value })} aria-label={t("Prix du lot TTC")} />
                                  {l0.tailleLot && num(l0.lotTTC) > 0 && <small className="rc-promo__unite">{t("{p} TND / pièce", { p: arrondir(num(l0.lotTTC) / l0.tailleLot, 3).toFixed(3) })}</small>}
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="rc-promo__num">
                                  <Marge valeur={actuelle} />
                                </td>
                                <td className="rc-promo__num rc-promo__effet">{modeCalcul === "UN_PLUS_UN" ? t("1 acheté = 1 offert") : t("2ᵉ pièce à −50 %")}</td>
                              </>
                            )}
                            <td className="rc-promo__num">
                              <Gain valeur={gainPromo(modeCalcul, ligneCalcul)?.gain} />
                            </td>
                            <td className="rc-promo__num">
                              <Marge valeur={margePromo(modeCalcul, ligneCalcul)} />
                            </td>
                            <td>
                              <IconButton icon={closeOutline} size="sm" label={t("Retirer {a}", { a: a.designation })} onClick={() => retirer(l.articleId)} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="rc-footnote">
                {modeCalcul === "PRIX"
                  ? t("Prix d'achat et de vente TTC : un prix promo sous le prix d'achat TTC est une vente à perte (case en rouge). Gain / pièce : ce qui vous reste par pièce, la TVA reversée à l'État. Marge : ce gain sur le prix d'achat.")
                  : t("Marge : ce que rapporte une pièce en moyenne une fois les pièces offertes ou remisées comptées.")}
              </p>
            </Section>
            )}
          </div>
        )}
      </IonContent>

      {!chargement && (
        <ActionBar hint={manque ?? undefined}>
          <div className="rc-actionbar__row rc-actionbar__row--gauche">
            <Button size="lg" icon={saveOutline} loading={enCours} disabled={Boolean(manque)} onClick={enregistrer}>
              {promo ? t("Enregistrer") : t("Créer la promotion")}
            </Button>
            {promo?.statut === "EN_COURS" && (
              <Button size="lg" variant="secondary" icon={stopCircleOutline} onClick={() => setConfirmer("arreter")}>
                {t("Arrêter la promotion")}
              </Button>
            )}
            {promo && (
              <Button size="lg" variant="danger" icon={trashOutline} onClick={() => setConfirmer("supprimer")}>
                {t("Supprimer")}
              </Button>
            )}
          </div>
        </ActionBar>
      )}

      <ArticlePickerModal
        isOpen={picker !== null}
        articles={catalogue}
        selectedIds={picker?.pour === "lignes" ? lignes.map((l) => l.articleId) : []}
        title={picker?.pour === "offert" ? t("Article offert") : t("Articles de la promotion")}
        confirmLabel={picker?.pour === "offert" ? t("Choisir") : t("Ajouter")}
        onDismiss={() => setPicker(null)}
        onConfirm={(ids) => {
          if (picker?.pour === "offert") {
            const choisi = ids[0];
            if (choisi) maj(picker.articleId, { articleOffertId: choisi, articleOffert: parId.has(choisi) ? versPromo(parId.get(choisi)!) : null });
          } else ajouterArticles(ids);
          setPicker(null);
        }}
      />
      <IonAlert
        isOpen={confirmer !== null}
        onDidDismiss={() => setConfirmer(null)}
        header={confirmer === "arreter" ? t("Arrêter la promotion ?") : t("Supprimer la promotion ?")}
        message={confirmer === "arreter" ? t("Elle se termine hier : les nouveaux BL reprennent les prix normaux. Les BL déjà faits ne changent pas.") : t("Les BL déjà faits gardent leurs prix.")}
        buttons={[
          { text: t("Non"), role: "cancel" },
          {
            text: confirmer === "arreter" ? t("Arrêter") : t("Supprimer"),
            role: "destructive",
            handler: () => {
              if (!promo) return;
              if (confirmer === "arreter") void arreterPromotion(promo.id).then(setPromo).catch((err) => setErreur(err instanceof ApiError ? err.message : t("Impossible d'arrêter")));
              else void supprimerPromotion(promo.id).then(() => navigate("/promotions", { replace: true }));
            },
          },
        ]}
      />
    </IonPage>
  );
}
