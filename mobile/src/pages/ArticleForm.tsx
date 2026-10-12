import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage, useIonRouter, useIonToast } from "@ionic/react";
import { clipboardOutline, imagesOutline, scanOutline, sparklesOutline, trashOutline } from "ionicons/icons";
import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Clipboard } from "@capacitor/clipboard";
import { createArticle, deleteArticle, getArticle, infosCodeBarre, listArticles, referencesUtilisees, updateArticle } from "../api/articles";
import { scanCameraDisponible, scannerCodeBarre } from "../lib/barcode";
import type { Article, ArticleInput } from "../types/article";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import ArticleMouvements from "../components/ArticleMouvements";
import { formatAmount, pieces } from "../utils/format";
import { arrondir, htDepuisTTC, margeDepuis, ttcDepuisHT } from "../utils/tarifs";
import ArticleHistoriquePrix from "../components/ArticleHistoriquePrix";
import CodesBarresAlternatifs from "../components/CodesBarresAlternatifs";
import SelecteurCategorie from "../components/SelecteurCategorie";
import { chemin } from "../utils/categories";
import { useCategories } from "../utils/useCategories";
import { ActionBar, AppHeader, Button, Field, Group, IconButton, Money, PageNotice, PickerField, Section, Segmented, SkeletonList, Tag } from "../ui";
import ChampDateExpiration from "../components/ChampDateExpiration";
import { t } from "../i18n";

const emptyForm: ArticleInput = {
  code: "",
  codeBarre: "",
  codesBarres: [],
  designation: "",
  marque: "",
  unit: "",
  img: "",
  prixAchat: 0,
  prixVente: 0,
  colisage: 1,
  tva: 19,
  fodec: 0,
  prixGros: null,
  categorieId: null,
};

export default function ArticleForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();
  const canEdit = user?.role === "ADMIN";
  const router = useIonRouter();
  // L'admin ouvre le catalogue depuis Stock, le vendeur depuis l'onglet Articles.
  const listeHref = canEdit ? "/stock" : "/articles";
  // Retour à l'écran d'origine (Stock garde sa vue « Articles » affichée).
  const retour = () => (router.canGoBack() ? router.goBack() : navigate(listeHref, { replace: true }));

  const [form, setForm] = useState<ArticleInput>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Le champ Réf n'apparaît que si la société s'en sert (au moins un article en a une).
  const [refUtilisee, setRefUtilisee] = useState(false);
  useEffect(() => {
    referencesUtilisees()
      .then((r) => setRefUtilisee(r.utilisee))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const article = await getArticle(id!);
        setForm({
          code: article.code ?? "",
          codeBarre: article.codeBarre ?? "",
          codesBarres: (article.codesBarres ?? []).map((c) => ({ codeBarre: c.codeBarre, libelle: c.libelle ?? null })),
          designation: article.designation,
          marque: article.marque ?? "",
          unit: article.unit ?? "",
          img: article.img ?? "",
          prixAchat: Number(article.prixAchat ?? 0),
          prixVente: Number(article.prixVente),
          colisage: Number(article.colisage),
          tva: Number(article.tva),
          fodec: Number(article.fodec ?? 0),
          prixGros: article.prixGros == null ? null : Number(article.prixGros),
          categorieId: article.categorieId ?? null,
          stockMini: article.stockMini == null ? null : Number(article.stockMini),
          etiquette: article.etiquette ?? null,
          etiquetteJusqua: article.etiquetteJusqua ? String(article.etiquetteJusqua).slice(0, 10) : null,
        });
        const ht = Number(article.prixVente);
        const tva = Number(article.tva);
        const fodec = Number(article.fodec ?? 0);
        const marge = margeDepuis(ht, Number(article.prixAchat ?? 0));
        setPrix({
          ttc: String(ttcDepuisHT(ht, tva, fodec)),
          ht: String(arrondir(ht, 3)),
          marge: marge === undefined ? "" : String(marge),
          gros: article.prixGros == null ? "" : String(ttcDepuisHT(Number(article.prixGros), tva, fodec)),
        });
        setStockDepot(article.stockDepot);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Article introuvable"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const update = <K extends keyof ArticleInput>(key: K, value: ArticleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Prix liés : le TTC est le prix fixé ; le HT (6 décimales, enregistré) en découle ; la
  // marge est en % du prix d'achat HT. Dès qu'un champ change, les autres suivent.
  const [prix, setPrix] = useState({ ttc: "0", ht: "0", marge: "", gros: "" });
  const [stockDepot, setStockDepot] = useState<number | undefined>(undefined);
  const { categories, recharger: rechargerCategories } = useCategories();
  const [categorieOuverte, setCategorieOuverte] = useState(false);
  const texteMarge = (ht: number, achat: number) => {
    const m = margeDepuis(ht, achat);
    return m === undefined ? "" : String(m);
  };
  const surTTC = (v: string) => {
    const ht = htDepuisTTC(num(v, 0), form.tva, form.fodec);
    update("prixVente", ht);
    setPrix((p) => ({ ...p, ttc: v, ht: String(arrondir(ht, 3)), marge: texteMarge(ht, form.prixAchat) }));
  };
  const surHT = (v: string) => {
    const ht = num(v, 0);
    update("prixVente", ht);
    setPrix((p) => ({ ...p, ttc: String(ttcDepuisHT(ht, form.tva, form.fodec)), ht: v, marge: texteMarge(ht, form.prixAchat) }));
  };
  const surMarge = (v: string) => {
    const m = Number(v);
    if (v.trim() === "" || !Number.isFinite(m) || !(form.prixAchat > 0)) {
      setPrix((p) => ({ ...p, marge: v }));
      return;
    }
    const ttc = ttcDepuisHT(form.prixAchat * (1 + m / 100), form.tva, form.fodec);
    const ht = htDepuisTTC(ttc, form.tva, form.fodec);
    update("prixVente", ht);
    setPrix((p) => ({ ...p, ttc: String(ttc), ht: String(arrondir(ht, 3)), marge: v }));
  };
  const surAchat = (v: string) => {
    const achat = num(v, 0);
    update("prixAchat", achat);
    setPrix((p) => ({ ...p, marge: texteMarge(form.prixVente, achat) }));
  };
  // TVA ou FODEC modifiée : les prix TTC (vente et gros) restent ceux du client, ce sont les HT qui s'ajustent.
  const changerTaxes = (tva: number, fodec: number) => {
    update("tva", tva);
    update("fodec", fodec);
    const ht = htDepuisTTC(num(prix.ttc, 0), tva, fodec);
    update("prixVente", ht);
    if (prix.gros.trim() !== "") update("prixGros", htDepuisTTC(num(prix.gros, 0), tva, fodec));
    setPrix((p) => ({ ...p, ht: String(arrondir(ht, 3)), marge: texteMarge(ht, form.prixAchat) }));
  };
  const surTva = (v: string) => changerTaxes(num(v, 0), form.fodec);
  const surFodec = (v: string) => changerTaxes(form.tva, num(v, 0));
  const surGros = (v: string) => {
    setPrix((p) => ({ ...p, gros: v }));
    update("prixGros", v.trim() === "" ? null : htDepuisTTC(num(v, 0), form.tva, form.fodec));
  };

  const [toast] = useIonToast();
  const [recherche, setRecherche] = useState(false);
  // Article déjà créé avec ce code-barres (création d'un nouvel article seulement).
  const [existant, setExistant] = useState<Article | null>(null);
  const [attenteLien, setAttenteLien] = useState(false);

  /** Un article porte-t-il déjà ce code-barres (principal ou variante) ? */
  const chercherExistant = async (code: string): Promise<Article | null> => {
    if (!isNew || !code.trim()) return null;
    try {
      return (await listArticles({ codeBarre: code.trim() }))[0] ?? null;
    } catch {
      return null; // le serveur le refusera de toute façon à l'enregistrement
    }
  };

  /** Ouvre le moteur de recherche d'images avec le nom du produit (navigateur du téléphone). */
  const chercherPhoto = () => {
    const requete = [form.designation, form.marque, form.unit].filter(Boolean).join(" ").trim();
    if (!requete) {
      toast({ message: t("Saisissez d'abord la désignation."), duration: 2600, position: "top", cssClass: "rc-toast" });
      return;
    }
    setAttenteLien(true);
    window.open(`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(requete)}`, Capacitor.isNativePlatform() ? "_system" : "_blank", "noopener");
  };

  /** Colle l'adresse d'image copiée dans le navigateur (« Copier l'adresse de l'image »). */
  const collerLien = async (silencieux = false) => {
    try {
      const { value } = await Clipboard.read();
      const lien = (value ?? "").trim();
      if (/^https?:\/\/\S+$/i.test(lien)) {
        update("img", lien);
        toast({ message: t("Lien de l'image enregistré."), duration: 2200, position: "top", cssClass: "rc-toast" });
      } else if (!silencieux) {
        toast({ message: t("Aucun lien copié : copiez l'adresse de l'image dans le navigateur."), duration: 3000, position: "top", cssClass: "rc-toast" });
      }
    } catch {
      if (!silencieux) toast({ message: t("Presse-papiers inaccessible."), duration: 2600, position: "top", cssClass: "rc-toast" });
    }
  };

  // Retour du navigateur après « Chercher une photo » : le lien copié est repris tout seul.
  useEffect(() => {
    if (!attenteLien) return;
    const ecoute = App.addListener("appStateChange", ({ isActive }) => {
      if (!isActive) return;
      setAttenteLien(false);
      void collerLien(true);
    });
    return () => {
      void ecoute.then((h) => h.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attenteLien]);

  /**
   * Création d'un article : nom, marque, contenance et photo sont proposés d'après le code-barres (bases
   * ouvertes). Seuls les champs encore vides sont remplis : rien de ce que l'admin a saisi n'est écrasé.
   */
  const remplirDepuisCode = async (code: string) => {
    if (!isNew || recherche) return;
    if (!/^\d{8,14}$/.test(code.trim())) {
      toast({ message: t("Saisissez ou scannez d'abord le code-barres."), duration: 2600, position: "top", cssClass: "rc-toast" });
      return;
    }
    setRecherche(true);
    try {
      const { infos } = await infosCodeBarre(code.trim());
      if (!infos) {
        toast({ message: t("Produit inconnu des bases en ligne : saisissez ses informations."), duration: 2600, position: "top", cssClass: "rc-toast" });
        return;
      }
      setForm((f) => ({
        ...f,
        designation: f.designation.trim() ? f.designation : (infos.nom ?? "").toUpperCase(),
        marque: f.marque?.trim() ? f.marque : (infos.marque ?? "").toUpperCase(),
        unit: f.unit?.trim() ? f.unit : (infos.quantite ?? "").toUpperCase(),
        img: f.img?.trim() ? f.img : (infos.img ?? ""),
      }));
      toast({ message: t("Informations trouvées : vérifiez-les avant d'enregistrer."), duration: 2600, position: "top", cssClass: "rc-toast" });
    } catch {
      toast({ message: t("Recherche impossible pour le moment : saisissez les informations."), duration: 2600, position: "top", cssClass: "rc-toast" });
    } finally {
      setRecherche(false);
    }
  };

  /** Article déjà connu avec ce code-barres : on ouvre sa fiche au lieu d'en créer un doublon. */
  const ouvrirSiExistant = async (code: string) => {
    const deja = await chercherExistant(code);
    if (!deja) return;
    toast({ message: t("Cet article existe déjà."), duration: 2200, position: "top", cssClass: "rc-toast" });
    navigate(`/articles/${deja.id}`, { replace: true });
  };

  const handleScanBarcode = async () => {
    setError(null);
    setScanning(true);
    const result = await scannerCodeBarre();
    setScanning(false);
    if ("code" in result) {
      update("codeBarre", result.code);
      await ouvrirSiExistant(result.code);
    } else if ("error" in result) setError(result.error);
  };

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await createArticle(form);
        navigate(`/articles/${created.id}`, { replace: true });
      } else {
        await updateArticle(id!, form);
        retour();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      await deleteArticle(id!);
      retour();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la suppression"));
      setSaving(false);
    }
  };

  const ro = !canEdit;
  const num = (v: string, fallback: number) => (v === "" ? fallback : Number(v));

  return (
    <IonPage>
      <AppHeader
        backHref={listeHref}
        title={isNew ? t("Nouvel article") : form.designation || t("Article")}
        actions={
          isNew && canEdit ? (
            <IconButton
              icon={sparklesOutline}
              label={t("Remplir d'après le code-barres")}
              onClick={() => void remplirDepuisCode(form.codeBarre)}
              disabled={recherche}
            />
          ) : undefined
        }
      />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}
        {isNew && existant && (
          <PageNotice tone="warning" actionLabel={t("Ouvrir")} onAction={() => navigate(`/articles/${existant.id}`, { replace: true })}>
            {t("Cet article existe déjà : {nom}", { nom: existant.designation })}
          </PageNotice>
        )}

        {loading ? (
          <SkeletonList rows={5} />
        ) : (
          <div className="rc-grille">
            {/* Fiche : l'essentiel d'un coup d'œil (prix payé par le client, taxes, marge, stock). */}
            {canEdit && !isNew && (
              <div className="rc-summary">
                <p className="rc-summary__label">{t("Prix de vente TTC")}</p>
                <Money value={ttcDepuisHT(form.prixVente, form.tva, form.fodec)} size="xl" />
                <div className="rc-fiche__tags">
                  <Tag>{t("TVA {n} %", { n: form.tva })}</Tag>
                  {form.fodec > 0 && <Tag>{t("FODEC {n} %", { n: form.fodec })}</Tag>}
                  {prix.marge !== "" && (
                    <Tag tone={Number(prix.marge) < 0 ? "danger" : "accent"}>{t("Marge {n} %", { n: prix.marge })}</Tag>
                  )}
                  {stockDepot !== undefined && (
                    <Tag tone={stockDepot <= 0 ? "warning" : "positive"}>
                      {t("Dépôt : {q}", { q: `${stockDepot} ${pieces(stockDepot)}` })}
                    </Tag>
                  )}
                </div>
              </div>
            )}

            <div className="rc-media">
              <ArticleImage src={form.img} alt={form.designation || t("Article")} size={112} />
              <div className="rc-media__body">
                {ro ? (
                  <>
                    <p className="rc-media__title">{form.designation}</p>
                    <p className="rc-media__meta rc-num">{formatAmount(form.prixVente)} {t("TND")}</p>
                  </>
                ) : (
                  <Field
                    label={t("Lien de l'image")}
                    placeholder="https://…"
                    value={form.img ?? ""}
                    onChange={(v) => update("img", v.trim())}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    hint={t("Affichée en ligne seulement.")}
                    suffix={
                      <>
                        <IconButton icon={imagesOutline} label={t("Chercher une photo sur Internet")} size="sm" onClick={chercherPhoto} />
                        <IconButton icon={clipboardOutline} label={t("Coller le lien copié")} size="sm" onClick={() => void collerLien()} />
                      </>
                    }
                  />
                )}
              </div>
            </div>

            <Section label={t("Identification")}>
              <Group pad>
                <div className="rc-fields">
                  <Field
                    label={t("Code-barres")}
                    value={form.codeBarre}
                    onChange={(v) => {
                      update("codeBarre", v);
                      setExistant(null);
                    }}
                    onBlur={() => void chercherExistant(form.codeBarre).then(setExistant)}
                    readOnly={ro}
                    required
                    inputMode="numeric"
                    // Douchette (ordinateur) : le code arrive tapé, suivi d'Entrée.
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void ouvrirSiExistant(form.codeBarre);
                      }
                    }}
                    suffix={
                      scanCameraDisponible() ? (
                        <IconButton icon={scanOutline} label={t("Scanner le code-barres")} onClick={handleScanBarcode} disabled={scanning} />
                      ) : undefined
                    }
                  />
                  {(refUtilisee || form.code) && (
                    <Field label={t("Réf")} hint={ro ? undefined : t("Facultative")} value={form.code} onChange={(v) => update("code", v)} readOnly={ro} autoCapitalize="characters" />
                  )}
                  <Field label={t("Désignation")} value={form.designation} onChange={(v) => update("designation", v)} readOnly={ro} required />
                  {/* Catégorie facultative (création rapide) : un article sans catégorie est signalé « à classer » dans le dépôt. */}
                  {ro ? (
                    form.categorieId && <Field label={t("Catégorie")} value={chemin(categories, form.categorieId)} readOnly />
                  ) : (
                    categories.length > 0 && (
                      <PickerField
                        label={t("Catégorie")}
                        value={form.categorieId ? chemin(categories, form.categorieId) : undefined}
                        placeholder={t("Aucune : à classer plus tard")}
                        onOpen={() => setCategorieOuverte(true)}
                      />
                    )
                  )}
                  <div className="rc-fields__row">
                    <Field label={t("Marque")} value={form.marque} onChange={(v) => update("marque", v)} readOnly={ro} />
                    <Field label={t("Unité")} placeholder={t("ex : 160 ML")} value={form.unit} onChange={(v) => update("unit", v)} readOnly={ro} />
                  </div>
                </div>
              </Group>
            </Section>

            <Section label={t("Tarifs et conditionnement")}>
              <Group pad>
                <div className="rc-fields">
                  {/* Prix d'achat et marge : réservés à l'admin (le serveur ne les envoie pas aux vendeurs). */}
                  {canEdit && (
                    <div className="rc-fields__row">
                      <Field
                        label={t("Prix d'achat HT")}
                        type="number"
                        inputMode="decimal"
                        value={form.prixAchat}
                        onChange={surAchat}
                        suffix="TND"
                      />
                      <Field
                        label={t("Marge")}
                        type="number"
                        inputMode="decimal"
                        value={prix.marge}
                        onChange={surMarge}
                        suffix="%"
                        hint={form.prixAchat > 0 ? t("Sur le prix d'achat") : t("Renseignez le prix d'achat")}
                      />
                    </div>
                  )}
                  <div className="rc-fields__row">
                    <Field
                      label={t("Prix de vente TTC")}
                      type="number"
                      inputMode="decimal"
                      value={ro ? formatAmount(ttcDepuisHT(form.prixVente, form.tva, form.fodec)) : prix.ttc}
                      onChange={surTTC}
                      readOnly={ro}
                      staticSuffix="TND"
                      suffix="TND"
                    />
                    <Field
                      label={t("Prix de vente HT")}
                      type="number"
                      inputMode="decimal"
                      value={ro ? formatAmount(form.prixVente) : prix.ht}
                      onChange={surHT}
                      readOnly={ro}
                      staticSuffix="TND"
                      suffix="TND"
                    />
                  </div>
                  <div className="rc-fields__row">
                    <Field
                      label={t("Colisage")}
                      type="number"
                      inputMode="numeric"
                      value={form.colisage}
                      onChange={(v) => update("colisage", num(v, 0))}
                      readOnly={ro}
                      hint={ro ? undefined : t("Pièces par colis")}
                    />
                    <Field
                      label={t("TVA")}
                      type="number"
                      inputMode="decimal"
                      value={form.tva}
                      onChange={surTva}
                      readOnly={ro}
                      staticSuffix="%"
                      suffix="%"
                    />
                  </div>
                  {canEdit && (
                    <div className="rc-fields__row">
                      <Field
                        label={t("FODEC")}
                        type="number"
                        inputMode="decimal"
                        value={form.fodec}
                        onChange={surFodec}
                        suffix="%"
                        hint={t("1 % du prix HT, sinon 0")}
                      />
                      <Field
                        label={t("Prix de gros TTC")}
                        type="number"
                        inputMode="decimal"
                        value={prix.gros}
                        onChange={surGros}
                        suffix="TND"
                        hint={t("Facultatif")}
                      />
                    </div>
                  )}
                </div>
              </Group>
            </Section>

            {/* Couleurs du plan 3D du dépôt : stock bas sous le stock minimum, bleu pour une nouveauté ou une promotion. */}
            {canEdit && (
              <Section label={t("Alertes de stock")}>
                <Group pad>
                  <div className="rc-fields">
                    <Field
                      label={t("Stock minimum (pièces)")}
                      type="number"
                      inputMode="numeric"
                      value={form.stockMini ?? ""}
                      onChange={(v) => update("stockMini", v.trim() === "" ? null : Math.max(0, Number(v)) || null)}
                      hint={t("Vide : un colis. En dessous, l'article passe en orange sur le plan 3D.")}
                    />
                    <Segmented
                      label={t("Mise en avant")}
                      value={form.etiquette ?? "AUCUNE"}
                      onChange={(v) => {
                        update("etiquette", v === "AUCUNE" ? null : v);
                        if (v === "AUCUNE") update("etiquetteJusqua", null);
                      }}
                      options={[
                        { value: "AUCUNE", label: t("Aucune") },
                        { value: "NOUVEAU", label: t("Nouveauté") },
                        { value: "PROMOTION", label: t("Promotion") },
                      ]}
                    />
                    {form.etiquette && (
                      <ChampDateExpiration
                        label={t("Jusqu'au (facultatif)")}
                        value={form.etiquetteJusqua ?? ""}
                        onChange={(d) => update("etiquetteJusqua", d || null)}
                      />
                    )}
                  </div>
                </Group>
              </Section>
            )}

            <CodesBarresAlternatifs
              value={form.codesBarres ?? []}
              onChange={(codes) => update("codesBarres", codes)}
              readOnly={ro}
              codePrincipal={form.codeBarre}
            />

            {canEdit && !isNew && <ArticleHistoriquePrix articleId={id!} />}

            {canEdit && !isNew && <ArticleMouvements articleId={id!} />}

            {canEdit && !isNew && (
              <Section className="rc-span">
                <Button variant="danger" block icon={trashOutline} onClick={() => setConfirmDelete(true)} disabled={saving}>
                  {t("Supprimer l'article")}
                </Button>
              </Section>
            )}
          </div>
        )}

        <IonAlert
          isOpen={confirmDelete}
          onDidDismiss={() => setConfirmDelete(false)}
          header={t("Supprimer l'article ?")}
          message={t("Cette action désactive l'article. Elle est réversible en base.")}
          buttons={[
            { text: t("Annuler"), role: "cancel" },
            { text: t("Supprimer"), role: "destructive", handler: handleDelete },
          ]}
        />
      </IonContent>

      {canEdit && !loading && (
        <ActionBar hint={!form.codeBarre.trim() || !form.designation ? t("Code-barres et désignation sont obligatoires") : undefined}>
          <Button size="lg" block loading={saving} disabled={!form.codeBarre.trim() || !form.designation} onClick={handleSave}>
            {t("Enregistrer")}
          </Button>
        </ActionBar>
      )}

      <SelecteurCategorie
        isOpen={categorieOuverte}
        categories={categories}
        value={form.categorieId}
        recharger={rechargerCategories}
        onSelect={(id) => {
          update("categorieId", id);
          setCategorieOuverte(false);
        }}
        onDismiss={() => setCategorieOuverte(false)}
      />
    </IonPage>
  );
}
