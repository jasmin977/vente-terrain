import { useEffect, useState } from "react";
import { IonAlert } from "@ionic/react";
import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { cameraOutline, checkmarkOutline, closeOutline, settingsOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { uploadImage } from "../../api/uploads";
import { createDepense, deleteDepense, updateDepense } from "../../api/depenses";
import type { CategorieDepense, Depense } from "../../types/depense";
import type { Fournisseur } from "../../types/achat";
import type { UserSummary } from "../../types/auth";
import type { ModePaiement } from "../../types/facture";
import { Button, Field, IconButton, PageNotice, PickerField, PickerSheet, Segmented, Sheet } from "../../ui";
import { nomFournisseur } from "../achats/nomFournisseur";
import { modePaiementLabel } from "../../utils/labels";
import { toLocalDateString } from "../../utils/format";
import { urlImage } from "../../offline/images";
import { t } from "../../i18n";

const MODES: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"];
const AUCUN = "__aucun__";
const nombre = (texte: string) => Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

interface Props {
  isOpen: boolean;
  /** Dépense à modifier ; absente : nouvelle dépense. */
  depense?: Depense | null;
  categories: CategorieDepense[];
  fournisseurs: Fournisseur[];
  vendeurs: UserSummary[];
  onDismiss: () => void;
  onEnregistre: (message: string) => void;
  onGererCategories: () => void;
}

/** Saisie d'une dépense : payée tout de suite (mode de paiement et son numéro), avec reçu en photo si besoin. */
export default function DepenseFormSheet({ isOpen, depense, categories, fournisseurs, vendeurs, onDismiss, onEnregistre, onGererCategories }: Props) {
  const aujourdhui = toLocalDateString(new Date());
  const [date, setDate] = useState(aujourdhui);
  const [categorieId, setCategorieId] = useState<string | undefined>(undefined);
  const [montantTxt, setMontantTxt] = useState("");
  const [mode, setMode] = useState<ModePaiement>("ESPECES");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(undefined);
  const [beneficiaire, setBeneficiaire] = useState("");
  const [vendeurId, setVendeurId] = useState<string | undefined>(undefined);
  const [photo, setPhoto] = useState<string | null>(null);
  const [picker, setPicker] = useState<"categorie" | "fournisseur" | "vendeur" | null>(null);
  const [envoiPhoto, setEnvoiPhoto] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErreur(null);
    setDate(depense ? toLocalDateString(new Date(depense.date)) : aujourdhui);
    setCategorieId(depense?.categorieId);
    setMontantTxt(depense ? String(Number(depense.montant)) : "");
    setMode(depense?.mode && MODES.includes(depense.mode) ? depense.mode : "ESPECES");
    setReference(depense?.reference ?? "");
    setDescription(depense?.description ?? "");
    setFournisseurId(depense?.fournisseurId ?? undefined);
    setBeneficiaire(depense?.beneficiaire ?? "");
    setVendeurId(depense?.vendeurId ?? undefined);
    setPhoto(depense?.photo ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, depense]);

  const categorie = categories.find((c) => c.id === categorieId) ?? (depense && depense.categorieId === categorieId ? depense.categorie : undefined);
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  const vendeur = vendeurs.find((v) => v.id === vendeurId);
  const montant = nombre(montantTxt);
  const pret = Boolean(categorieId) && montant > 0 && description.trim() !== "" && Boolean(date) && (mode !== "TRAITE" || reference.trim() !== "");

  const ajouterPhoto = async () => {
    setErreur(null);
    setEnvoiPhoto(true);
    try {
      const p = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: Capacitor.isNativePlatform() ? CameraSource.Prompt : CameraSource.Photos,
        quality: 75,
        width: 1400,
        promptLabelHeader: t("Reçu"),
        promptLabelPhoto: t("Choisir depuis la galerie"),
        promptLabelPicture: t("Prendre une photo"),
      });
      if (!p.dataUrl) return;
      const { url } = await uploadImage(p.dataUrl);
      setPhoto(url);
    } catch (err) {
      if (err instanceof ApiError) setErreur(err.message);
    } finally {
      setEnvoiPhoto(false);
    }
  };

  const enregistrer = async () => {
    if (!categorieId) return;
    setEnCours(true);
    setErreur(null);
    const donnees = {
      date,
      categorieId,
      montant,
      mode,
      reference: reference.trim() || null,
      description: description.trim(),
      fournisseurId: fournisseurId ?? null,
      beneficiaire: fournisseurId ? null : beneficiaire.trim() || null,
      vendeurId: vendeurId ?? null,
      photo,
    };
    try {
      if (depense) await updateDepense(depense.id, donnees);
      else await createDepense(donnees);
      onEnregistre(depense ? t("Dépense modifiée.") : t("Dépense enregistrée."));
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'enregistrer la dépense"));
    } finally {
      setEnCours(false);
    }
  };

  const supprimer = async () => {
    if (!depense) return;
    setErreur(null);
    try {
      await deleteDepense(depense.id);
      onEnregistre(t("Dépense supprimée."));
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de supprimer la dépense"));
    }
  };

  const apercu = urlImage(photo);

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={depense ? t("Dépense") : t("Nouvelle dépense")}
        large
        onDismiss={onDismiss}
        footer={
          <div className={`rc-achat__pied${depense ? " rc-achat__pied--actions" : ""}`}>
            {depense && (
              <Button variant="danger" icon={trashOutline} onClick={() => setConfirmerSuppression(true)}>
                {t("Supprimer")}
              </Button>
            )}
            <Button size="lg" icon={checkmarkOutline} loading={enCours} disabled={!pret} onClick={enregistrer}>
              {t("Enregistrer")}
            </Button>
          </div>
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}

          <div className="rc-achat__ligne3">
            <div className="rc-achat__fournisseur">
              <PickerField label={t("Catégorie")} required value={categorie?.nom} placeholder={t("Choisir")} onOpen={() => setPicker("categorie")} />
              <Button variant="ghost" icon={settingsOutline} onClick={onGererCategories}>
                {t("Gérer les catégories")}
              </Button>
            </div>
            <Field label={t("Montant (TND)")} inputMode="decimal" value={montantTxt} placeholder="0.000" onChange={setMontantTxt} required />
            <Field label={t("Date")} type="date" value={date} max={aujourdhui} onChange={(v) => setDate(v || aujourdhui)} required />
          </div>

          <Field label={t("Description")} value={description} onChange={setDescription} placeholder={t("Ex. Vidange camion, perceuse Bosch…")} required />

          <Segmented
            label={t("Mode de paiement")}
            variant="tiles"
            wrap
            value={mode}
            onChange={setMode}
            options={MODES.map((m) => ({ value: m, label: modePaiementLabel[m] }))}
          />
          {mode !== "ESPECES" && (
            <Field
              label={mode === "TRAITE" ? t("N° de la traite") : mode === "CHEQUE" ? t("N° du chèque") : t("Référence du virement")}
              value={reference}
              onChange={setReference}
              required={mode === "TRAITE"}
            />
          )}

          <div className="rc-achat__ligne2">
            <div className="rc-achat__fournisseur">
              <PickerField
                label={t("Payé à (fournisseur)")}
                value={fournisseur ? nomFournisseur(fournisseur) : undefined}
                placeholder={t("Aucun — nom libre")}
                onOpen={() => setPicker("fournisseur")}
              />
              {!fournisseur && <Field label={t("Bénéficiaire")} hideLabel value={beneficiaire} placeholder={t("Ex. Garage Ben Salah")} onChange={setBeneficiaire} />}
            </div>
            <PickerField label={t("Camion / vendeur")} value={vendeur?.nom} placeholder={t("Aucun")} onOpen={() => setPicker("vendeur")} />
          </div>

          <div className="rc-depense__photo">
            {apercu ? (
              <>
                <a href={apercu} target="_blank" rel="noreferrer">
                  <img src={apercu} alt={t("Reçu")} />
                </a>
                <IconButton icon={closeOutline} label={t("Retirer le reçu")} onClick={() => setPhoto(null)} />
              </>
            ) : (
              <Button variant="secondary" icon={cameraOutline} loading={envoiPhoto} onClick={ajouterPhoto}>
                {t("Ajouter le reçu (photo)")}
              </Button>
            )}
          </div>
        </div>
      </Sheet>

      <PickerSheet
        isOpen={picker === "categorie"}
        title={t("Catégorie")}
        value={categorieId}
        onDismiss={() => setPicker(null)}
        onSelect={(v) => {
          setCategorieId(v);
          setPicker(null);
        }}
        options={categories.map((c) => ({ value: c.id, label: c.nom }))}
      />
      <PickerSheet
        isOpen={picker === "fournisseur"}
        title={t("Payé à")}
        value={fournisseurId ?? AUCUN}
        onDismiss={() => setPicker(null)}
        onSelect={(v) => {
          setFournisseurId(v === AUCUN ? undefined : v);
          setPicker(null);
        }}
        options={[
          { value: AUCUN, label: t("Aucun — nom libre") },
          ...fournisseurs.map((f) => ({ value: f.id, label: nomFournisseur(f), keywords: `${f.ref} ${f.matriculeFiscal ?? ""}` })),
        ]}
      />
      <PickerSheet
        isOpen={picker === "vendeur"}
        title={t("Camion / vendeur")}
        value={vendeurId ?? AUCUN}
        onDismiss={() => setPicker(null)}
        onSelect={(v) => {
          setVendeurId(v === AUCUN ? undefined : v);
          setPicker(null);
        }}
        options={[{ value: AUCUN, label: t("Aucun") }, ...vendeurs.map((v) => ({ value: v.id, label: v.nom, meta: v.code, keywords: v.code }))]}
      />
      <IonAlert
        isOpen={confirmerSuppression}
        onDidDismiss={() => setConfirmerSuppression(false)}
        header={t("Supprimer cette dépense ?")}
        buttons={[
          { text: t("Non"), role: "cancel" },
          {
            text: t("Supprimer"),
            role: "destructive",
            handler: () => {
              void supprimer();
            },
          },
        ]}
      />
    </>
  );
}
