import { useState } from "react";
import { useIonToast } from "@ionic/react";
import { eyeOffOutline, eyeOutline } from "ionicons/icons";
import { changerMonMotDePasse } from "../api/auth";
import { ApiError, setToken } from "../api/client";
import { Button, Field, IconButton, Notice, Section, Sheet } from "../ui";
import { t } from "../i18n";

const MIN = 8;

/**
 * Changement du mot de passe du compte connecté (admin). Demande l'actuel ;
 * les autres appareils connectés à ce compte sont déconnectés, celui-ci reste
 * connecté grâce au nouveau jeton renvoyé par le serveur.
 */
export default function MonMotDePasseSheet({ isOpen, onDismiss }: { isOpen: boolean; onDismiss: () => void }) {
  const [actuel, setActuel] = useState("");
  const [nouveau, setNouveau] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast] = useIonToast();

  const tropCourt = nouveau.length > 0 && nouveau.length < MIN;
  const differents = confirmation.length > 0 && confirmation !== nouveau;
  const valide = actuel.length > 0 && nouveau.length >= MIN && confirmation === nouveau;

  const enregistrer = async () => {
    if (!valide) return;
    setSaving(true);
    setError(null);
    try {
      const { token } = await changerMonMotDePasse(actuel, nouveau);
      await setToken(token);
      toast({ message: t("Mot de passe changé."), duration: 2400, position: "top", cssClass: "rc-toast" });
      onDismiss();
    } catch (err) {
      setError(err instanceof ApiError ? t(err.message) : t("Impossible de joindre le serveur. Réessayez avec une connexion."));
    } finally {
      setSaving(false);
    }
  };

  const oeil = (
    <IconButton
      icon={visible ? eyeOffOutline : eyeOutline}
      label={visible ? t("Masquer le mot de passe") : t("Afficher le mot de passe")}
      aria-pressed={visible}
      onClick={() => setVisible((v) => !v)}
    />
  );
  const commun = { type: visible ? "text" : "password", autoCapitalize: "off", autoCorrect: "off", spellCheck: false } as const;

  return (
    <Sheet
      isOpen={isOpen}
      title={t("Changer mon mot de passe")}
      onDismiss={onDismiss}
      onWillPresent={() => {
        setActuel("");
        setNouveau("");
        setConfirmation("");
        setVisible(false);
        setError(null);
      }}
      footer={
        <Button size="lg" block loading={saving} disabled={!valide || saving} onClick={enregistrer}>
          {t("Enregistrer le mot de passe")}
        </Button>
      }
    >
      <Section>
        <div className="rc-fields">
          {error && <Notice>{error}</Notice>}
          <Field
            {...commun}
            label={t("Mot de passe actuel")}
            value={actuel}
            onChange={setActuel}
            autoComplete="current-password"
            required
            suffix={oeil}
          />
          <Field
            {...commun}
            label={t("Nouveau mot de passe")}
            value={nouveau}
            onChange={setNouveau}
            autoComplete="new-password"
            required
            error={tropCourt ? t("{n} caractères minimum", { n: MIN }) : undefined}
            hint={t("{n} caractères minimum.", { n: MIN })}
          />
          <Field
            {...commun}
            label={t("Confirmer le nouveau mot de passe")}
            value={confirmation}
            onChange={setConfirmation}
            autoComplete="new-password"
            required
            error={differents ? t("Les deux mots de passe ne correspondent pas") : undefined}
          />
          <p className="rc-footnote">{t("Vos autres appareils connectés à ce compte seront déconnectés.")}</p>
        </div>
      </Section>
    </Sheet>
  );
}
