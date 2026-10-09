import { useState } from "react";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { cameraOutline } from "ionicons/icons";
import { createSociete, updateSociete } from "../api/societes";
import { uploadImage } from "../api/uploads";
import { ApiError } from "../api/client";
import type { Societe, SocieteInput } from "../types/societe";
import { Button, Field, Notice, Sheet } from "../ui";
import { t } from "../i18n";
import SocieteLogo from "./SocieteLogo";

const vide: SocieteInput = { nom: "", code: "", activite: "", matriculeFiscal: "", adresse: "", telephone: "", logo: "" };

// Code proposé à partir du nom : initiales (Bonne Affaire Cosmetix → BAC).
const codePropose = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean)
    .map((m) => m[0])
    .join("")
    .slice(0, 4);

/** Création / modification d'une société : identité, coordonnées et logo. */
export default function SocieteFormSheet({
  isOpen,
  societe,
  onDismiss,
  onSaved,
}: {
  isOpen: boolean;
  /** Société à modifier ; absente pour une création. */
  societe: Societe | null;
  onDismiss: () => void;
  onSaved: (societe: Societe) => void;
}) {
  const [form, setForm] = useState<SocieteInput>(vide);
  const [codeTouche, setCodeTouche] = useState(false);
  const [saving, setSaving] = useState(false);
  const [envoiLogo, setEnvoiLogo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (k: keyof SocieteInput, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const valide = form.nom.trim() !== "" && /^[A-Za-z0-9]{2,6}$/.test(form.code.trim());

  const choisirLogo = async () => {
    setError(null);
    setEnvoiLogo(true);
    try {
      const photo = await Camera.getPhoto({
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt,
        quality: 80,
        width: 512,
        promptLabelHeader: t("Logo de la société"),
        promptLabelPhoto: t("Choisir depuis la galerie"),
        promptLabelPicture: t("Prendre une photo"),
      });
      if (!photo.dataUrl) return;
      const { url } = await uploadImage(photo.dataUrl);
      update("logo", url);
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      // sinon : sélection annulée
    } finally {
      setEnvoiLogo(false);
    }
  };

  const enregistrer = async () => {
    if (!valide) return;
    setSaving(true);
    setError(null);
    try {
      const donnees = { ...form, code: form.code.trim().toUpperCase() };
      const s = societe ? await updateSociete(societe.id, donnees) : await createSociete(donnees);
      onSaved(s);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={societe ? t("Modifier la société") : t("Nouvelle société")}
      onDismiss={onDismiss}
      onWillPresent={() => {
        setError(null);
        setCodeTouche(Boolean(societe));
        setForm(
          societe
            ? {
                nom: societe.nom,
                code: societe.code,
                activite: societe.activite ?? "",
                matriculeFiscal: societe.matriculeFiscal ?? "",
                adresse: societe.adresse ?? "",
                telephone: societe.telephone ?? "",
                logo: societe.logo ?? "",
              }
            : vide
        );
      }}
      footer={
        <Button size="lg" block loading={saving} disabled={!valide || saving} onClick={enregistrer}>
          {societe ? t("Enregistrer") : t("Créer la société")}
        </Button>
      }
    >
      <div className="rc-fields rc-sheet__form">
        {error && <Notice>{error}</Notice>}
        <div className="rc-media rc-media--compact">
          <SocieteLogo nom={form.nom || "?"} logo={form.logo} size={72} />
          <Button variant="secondary" icon={cameraOutline} loading={envoiLogo} onClick={choisirLogo}>
            {form.logo ? t("Changer le logo") : t("Ajouter un logo")}
          </Button>
        </div>
        <Field
          label={t("Nom de la société")}
          value={form.nom}
          onChange={(v) => {
            update("nom", v);
            if (!codeTouche) update("code", codePropose(v));
          }}
          autoCapitalize="characters"
          required
        />
        <Field
          label={t("Code")}
          value={form.code}
          onChange={(v) => {
            setCodeTouche(true);
            update("code", v.toUpperCase());
          }}
          autoCapitalize="characters"
          required
          hint={t("2 à 6 lettres ou chiffres. Préfixe des codes vendeurs (ex. RC → RC-V001).")}
        />
        <Field label={t("Activité")} value={form.activite ?? ""} onChange={(v) => update("activite", v)} placeholder={t("ex : Fabrication de parfums et de cosmétiques")} />
        <Field label={t("Matricule fiscal")} value={form.matriculeFiscal ?? ""} onChange={(v) => update("matriculeFiscal", v)} autoCapitalize="characters" />
        <Field label={t("Adresse")} value={form.adresse ?? ""} onChange={(v) => update("adresse", v)} />
        <Field label={t("Téléphone")} type="tel" inputMode="tel" value={form.telephone ?? ""} onChange={(v) => update("telephone", v)} />
        <p className="rc-footnote">{t("Nom, activité, matricule fiscal, adresse et téléphone sont imprimés en en-tête des bons et tickets.")}</p>
      </div>
    </Sheet>
  );
}
