import { useEffect, useState } from "react";
import { addOutline } from "ionicons/icons";
import { createCategorie } from "../api/categories";
import { ApiError } from "../api/client";
import type { Categorie } from "../types/categorie";
import { racines } from "../utils/categories";
import { Button, Field, Notice, PickerField, PickerSheet, Segmented, Sheet } from "../ui";
import { t } from "../i18n";

type Type = "principale" | "sous";

/**
 * Création rapide d'une catégorie principale ou d'une sous-catégorie, quand aucune ne convient
 * pendant le classement d'un article. Le nom proposé est celui qu'on vient de chercher.
 */
export default function CreerCategorieSheet({
  isOpen,
  categories,
  nomInitial,
  onDismiss,
  onCree,
}: {
  isOpen: boolean;
  categories: Categorie[];
  nomInitial: string;
  onDismiss: () => void;
  onCree: (categorie: Categorie) => void | Promise<void>;
}) {
  const [nom, setNom] = useState("");
  const [type, setType] = useState<Type>("principale");
  const [parentId, setParentId] = useState<string | null>(null);
  const [parentOuvert, setParentOuvert] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setNom(nomInitial);
    setType("principale");
    setParentId(null);
    setErreur(null);
  }, [isOpen, nomInitial]);

  const parent = categories.find((c) => c.id === parentId);

  const creer = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await onCree(await createCategorie(nom.trim(), type === "sous" ? parentId : null));
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Opération impossible"));
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <>
      <Sheet isOpen={isOpen} title={t("Nouvelle catégorie")} height="auto" onDismiss={onDismiss}>
        <div className="rc-sheet__form">
          <div className="rc-fields">
            <Field label={t("Nom")} value={nom} onChange={setNom} maxLength={60} autoCapitalize="sentences" />
            <Segmented
              label={t("Type de catégorie")}
              value={type}
              onChange={setType}
              options={[
                { value: "principale", label: t("Catégorie principale") },
                { value: "sous", label: t("Sous-catégorie") },
              ]}
            />
            {type === "sous" && (
              <PickerField
                label={t("Dans quelle catégorie ?")}
                value={parent?.nom}
                placeholder={t("Choisir la catégorie")}
                required
                onOpen={() => setParentOuvert(true)}
              />
            )}
            {erreur && <Notice>{erreur}</Notice>}
            <Button size="lg" block icon={addOutline} loading={envoi} disabled={!nom.trim() || (type === "sous" && !parentId)} onClick={creer}>
              {t("Créer et choisir")}
            </Button>
          </div>
        </div>
      </Sheet>

      <PickerSheet
        isOpen={parentOuvert}
        title={t("Dans quelle catégorie ?")}
        value={parentId ?? undefined}
        options={racines(categories).map((r) => ({ value: r.id, label: r.nom }))}
        onSelect={(v) => {
          setParentId(v);
          setParentOuvert(false);
        }}
        onDismiss={() => setParentOuvert(false)}
        searchPlaceholder={t("Rechercher une catégorie…")}
      />
    </>
  );
}
