import { useState } from "react";
import { addOutline } from "ionicons/icons";
import { PickerSheet } from "../ui";
import CreerCategorieSheet from "./CreerCategorieSheet";
import type { Categorie } from "../types/categorie";
import { optionsClassement } from "../utils/categories";
import { t } from "../i18n";

/**
 * Choix de la catégorie d'un article : sous-catégories (ou catégories sans sous-catégorie), avec
 * recherche. Si aucune ne convient, « Créer une catégorie » en ajoute une (ou une sous-catégorie)
 * sur-le-champ et la choisit.
 */
export default function SelecteurCategorie({
  isOpen,
  categories,
  value,
  onSelect,
  onDismiss,
  titre,
  recharger,
}: {
  isOpen: boolean;
  categories: Categorie[];
  value?: string | null;
  onSelect: (categorieId: string) => void;
  onDismiss: () => void;
  titre?: string;
  /** Recharge l'arbre après la création d'une catégorie. */
  recharger: () => Promise<void>;
}) {
  const [creation, setCreation] = useState(false);
  const [nomInitial, setNomInitial] = useState("");

  return (
    <>
      <PickerSheet
        isOpen={isOpen}
        title={titre ?? t("Catégorie")}
        value={value ?? undefined}
        options={optionsClassement(categories)}
        onSelect={onSelect}
        onDismiss={onDismiss}
        searchPlaceholder={t("Rechercher une catégorie…")}
        emptyLabel={t("Aucune catégorie")}
        action={{
          label: t("Créer une catégorie"),
          icon: addOutline,
          onClick: (recherche) => {
            setNomInitial(recherche);
            setCreation(true);
          },
        }}
      />
      <CreerCategorieSheet
        isOpen={creation}
        categories={categories}
        nomInitial={nomInitial}
        onDismiss={() => setCreation(false)}
        onCree={async (categorie) => {
          await recharger();
          setCreation(false);
          onSelect(categorie.id);
        }}
      />
    </>
  );
}
