import { useState } from "react";
import { createClient } from "../offline/donnees";
import { ApiError } from "../api/client";
import type { Client, ClientInput } from "../types/client";
import { Button, Field, Notice, Sheet } from "../ui";
import { t } from "../i18n";

interface Props {
  isOpen: boolean;
  /** Pré-remplit le nom du commerce (recherche saisie dans le sélecteur). */
  nomInitial?: string;
  onCreated: (client: Client) => void;
  onDismiss: () => void;
}

const vide = { code: "", nomCommerce: "", telephone: "", ville: "" };

/**
 * Création rapide d'un client depuis une vente : l'essentiel seulement,
 * le reste (responsable, adresse) se complète ensuite depuis l'écran Clients.
 */
export default function ClientQuickSheet({ isOpen, nomInitial, onCreated, onDismiss }: Props) {
  const [form, setForm] = useState(vide);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof typeof vide, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const valide = form.code.trim() !== "" && form.nomCommerce.trim() !== "";

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      const input: ClientInput = {
        code: form.code.trim(),
        nomCommerce: form.nomCommerce.trim(),
        telephone: form.telephone.trim() || undefined,
        ville: form.ville.trim() || undefined,
      };
      const client = await createClient(input);
      onCreated({ ...client, solde: 0 });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={t("Nouveau client")}
      onDismiss={onDismiss}
      onWillPresent={() => {
        setForm({ ...vide, nomCommerce: nomInitial ?? "" });
        setError(null);
      }}
      footer={
        <Button block size="lg" onClick={handleSave} loading={saving} disabled={!valide || saving}>
          {t("Créer et sélectionner")}
        </Button>
      }
    >
      <div className="rc-fields rc-sheet__form">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field
          label={t("Nom du commerce")}
          value={form.nomCommerce}
          onChange={(v) => update("nomCommerce", v)}
          autoCapitalize="words"
          required
        />
        <Field
          label={t("Matricule Fiscale")}
          value={form.code}
          onChange={(v) => update("code", v)}
          autoCapitalize="characters"
          required
        />
        <Field
          label={t("Téléphone")}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={form.telephone}
          onChange={(v) => update("telephone", v)}
        />
        <Field label={t("Ville")} value={form.ville} onChange={(v) => update("ville", v)} autoCapitalize="words" />
        <p className="rc-footnote">{t("Responsable et adresse pourront être ajoutés depuis l'écran Clients.")}</p>
      </div>
    </Sheet>
  );
}
