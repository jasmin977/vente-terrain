import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonIcon, IonPage } from "@ionic/react";
import { timeOutline, trashOutline } from "ionicons/icons";
import { createClient, deleteClient, getClient, updateClient } from "../offline/donnees";
import type { ClientInput } from "../types/client";
import { ApiError } from "../api/client";
import { ActionBar, AppHeader, Button, Field, Group, PageNotice, Row, Section, SkeletonList } from "../ui";
import { t } from "../i18n";

const emptyForm: ClientInput = {
  code: "",
  nomCommerce: "",
  responsable: "",
  telephone: "",
  adresse: "",
  ville: "",
};

export default function ClientForm() {
  const { id } = useParams<{ id: string }>();
  const isNew = id === "new";
  const navigate = useNavigate();

  const [form, setForm] = useState<ClientInput>(emptyForm);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (isNew) return;
    (async () => {
      try {
        const client = await getClient(id!);
        setForm({
          code: client.code,
          nomCommerce: client.nomCommerce,
          responsable: client.responsable ?? "",
          telephone: client.telephone ?? "",
          adresse: client.adresse ?? "",
          ville: client.ville ?? "",
        });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Client introuvable"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id, isNew]);

  const update = <K extends keyof ClientInput>(key: K, value: ClientInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSave = async () => {
    setError(null);
    setSaving(true);
    try {
      if (isNew) {
        const created = await createClient(form);
        navigate(`/clients/${created.id}`, { replace: true });
      } else {
        await updateClient(id!, form);
        navigate("/clients");
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
      await deleteClient(id!);
      navigate("/clients");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de la suppression"));
      setSaving(false);
    }
  };

  return (
    <IonPage>
      <AppHeader backHref="/clients" title={isNew ? t("Nouveau client") : t("Modifier le client")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {loading ? (
          <SkeletonList rows={5} />
        ) : (
          <>
            {!isNew && (
              <Section>
                <Group>
                  <Row
                    onClick={() => navigate(`/clients/${id}/historique`)}
                    leading={
                      <span className="rc-thumb" style={{ width: 40, height: 40 }} aria-hidden="true">
                        <IonIcon icon={timeOutline} style={{ fontSize: 22, color: "var(--rc-ink)" }} />
                      </span>
                    }
                    title={t("Historique")}
                    meta={t("Bons de livraison, retours et paiements")}
                    chevron
                  />
                </Group>
              </Section>
            )}

            <Section label={t("Commerce")}>
              <Group pad>
                <div className="rc-fields">
                  <Field
                    label={t("Matricule Fiscale")}
                    value={form.code}
                    onChange={(v) => update("code", v)}
                    autoCapitalize="characters"
                    required
                  />
                  <Field
                    label={t("Nom du commerce")}
                    value={form.nomCommerce}
                    onChange={(v) => update("nomCommerce", v)}
                    autoCapitalize="words"
                    required
                  />
                </div>
              </Group>
            </Section>

            <Section label={t("Contact")}>
              <Group pad>
                <div className="rc-fields">
                  <Field
                    label={t("Responsable")}
                    value={form.responsable}
                    onChange={(v) => update("responsable", v)}
                    autoCapitalize="words"
                    autoComplete="name"
                  />
                  <Field
                    label={t("Téléphone")}
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    value={form.telephone}
                    onChange={(v) => update("telephone", v)}
                  />
                  <Field label={t("Adresse")} value={form.adresse} onChange={(v) => update("adresse", v)} autoComplete="street-address" />
                  <Field label={t("Ville")} value={form.ville} onChange={(v) => update("ville", v)} autoCapitalize="words" />
                </div>
              </Group>
            </Section>

            {!isNew && (
              <Section>
                <Button variant="danger" block icon={trashOutline} onClick={() => setConfirmDelete(true)} disabled={saving}>
                  {t("Supprimer le client")}
                </Button>
              </Section>
            )}
          </>
        )}

        <IonAlert
          isOpen={confirmDelete}
          onDidDismiss={() => setConfirmDelete(false)}
          header={t("Supprimer le client ?")}
          message={t("Cette action désactive le client. Elle est réversible en base.")}
          buttons={[
            { text: t("Annuler"), role: "cancel" },
            { text: t("Supprimer"), role: "destructive", handler: handleDelete },
          ]}
        />
      </IonContent>

      {!loading && (
        <ActionBar hint={!form.code || !form.nomCommerce ? t("Matricule fiscale et nom du commerce sont obligatoires") : undefined}>
          <Button size="lg" block loading={saving} disabled={!form.code || !form.nomCommerce} onClick={handleSave}>
            {t("Enregistrer")}
          </Button>
        </ActionBar>
      )}
    </IonPage>
  );
}
