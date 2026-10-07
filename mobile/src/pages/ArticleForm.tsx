import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { IonAlert, IonContent, IonPage, useIonRouter } from "@ionic/react";
import { cameraOutline, scanOutline, trashOutline } from "ionicons/icons";
import { createArticle, deleteArticle, getArticle, updateArticle } from "../api/articles";
import { uploadImage } from "../api/uploads";
import { scannerCodeBarre } from "../lib/barcode";
import type { ArticleInput } from "../types/article";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import { formatAmount } from "../utils/format";
import { ActionBar, AppHeader, Button, Field, Group, IconButton, PageNotice, Section, SkeletonList } from "../ui";
import { t } from "../i18n";

const emptyForm: ArticleInput = {
  code: "",
  codeBarre: "",
  designation: "",
  marque: "",
  unit: "",
  img: "",
  prixAchat: 0,
  prixVente: 0,
  colisage: 1,
  tva: 19,
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
  const [uploadingImage, setUploadingImage] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const article = await getArticle(id!);
        setForm({
          code: article.code,
          codeBarre: article.codeBarre ?? "",
          designation: article.designation,
          marque: article.marque ?? "",
          unit: article.unit ?? "",
          img: article.img ?? "",
          prixAchat: Number(article.prixAchat ?? 0),
          prixVente: Number(article.prixVente),
          colisage: Number(article.colisage),
          tva: Number(article.tva),
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Article introuvable"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const update = <K extends keyof ArticleInput>(key: K, value: ArticleInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handlePickImage = async () => {
    setError(null);
    setUploadingImage(true);
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 70,
        promptLabelHeader: t("Photo du produit"),
        promptLabelPhoto: t("Choisir depuis la galerie"),
        promptLabelPicture: t("Prendre une photo"),
      });
      if (!photo.dataUrl) return;
      const { url } = await uploadImage(photo.dataUrl);
      update("img", url);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      // sinon l'utilisateur a simplement annulé la sélection
    } finally {
      setUploadingImage(false);
    }
  };

  const handleScanBarcode = async () => {
    setError(null);
    setScanning(true);
    const result = await scannerCodeBarre();
    setScanning(false);
    if ("code" in result) update("codeBarre", result.code);
    else if ("error" in result) setError(result.error);
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
        title={isNew ? t("Nouvel article") : canEdit ? t("Modifier l'article") : t("Article")}
      />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {loading ? (
          <SkeletonList rows={5} />
        ) : (
          <>
            <div className="rc-media">
              <ArticleImage src={form.img} alt={form.designation || t("Article")} size={112} />
              <div className="rc-media__body">
                {ro ? (
                  <>
                    <p className="rc-media__title">{form.designation}</p>
                    <p className="rc-media__meta rc-num">{formatAmount(form.prixVente)} {t("TND")}</p>
                  </>
                ) : (
                  <Button variant="secondary" icon={cameraOutline} loading={uploadingImage} onClick={handlePickImage}>
                    {form.img ? t("Changer la photo") : t("Ajouter une photo")}
                  </Button>
                )}
              </div>
            </div>

            <Section label={t("Identification")}>
              <Group pad>
                <div className="rc-fields">
                  <Field label={t("Code")} value={form.code} onChange={(v) => update("code", v)} readOnly={ro} required autoCapitalize="characters" />
                  <Field
                    label={t("Code-barres")}
                    value={form.codeBarre}
                    onChange={(v) => update("codeBarre", v)}
                    readOnly={ro}
                    inputMode="numeric"
                    suffix={
                      <IconButton
                        icon={scanOutline}
                        label={t("Scanner le code-barres")}
                        onClick={handleScanBarcode}
                        disabled={scanning}
                      />
                    }
                  />
                  <Field label={t("Désignation")} value={form.designation} onChange={(v) => update("designation", v)} readOnly={ro} required />
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
                  <div className="rc-fields__row">
                    {/* Prix d'achat : réservé à l'admin (le serveur ne l'envoie pas aux vendeurs). */}
                    {canEdit && (
                      <Field
                        label={t("Prix d'achat")}
                        type="number"
                        inputMode="decimal"
                        value={form.prixAchat}
                        onChange={(v) => update("prixAchat", num(v, 0))}
                        suffix="TND"
                      />
                    )}
                    <Field
                      label={t("Prix de vente")}
                      type="number"
                      inputMode="decimal"
                      value={ro ? formatAmount(form.prixVente) : form.prixVente}
                      onChange={(v) => update("prixVente", num(v, 0))}
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
                      onChange={(v) => update("tva", num(v, 0))}
                      readOnly={ro}
                      staticSuffix="%"
                      suffix="%"
                    />
                  </div>
                </div>
              </Group>
            </Section>

            {canEdit && !isNew && (
              <Section>
                <Button variant="danger" block icon={trashOutline} onClick={() => setConfirmDelete(true)} disabled={saving}>
                  {t("Supprimer l'article")}
                </Button>
              </Section>
            )}
          </>
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
        <ActionBar hint={!form.code || !form.designation ? t("Code et désignation sont obligatoires") : undefined}>
          <Button size="lg" block loading={saving} disabled={!form.code || !form.designation} onClick={handleSave}>
            {t("Enregistrer")}
          </Button>
        </ActionBar>
      )}
    </IonPage>
  );
}
