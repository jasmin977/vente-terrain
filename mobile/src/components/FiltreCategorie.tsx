import { useState } from "react";
import { FilterChip, PickerSheet } from "../ui";
import type { Categorie } from "../types/categorie";
import { chemin, optionsFiltre } from "../utils/categories";
import { t } from "../i18n";

const TOUTES = "__toutes__";

/** Puce « Toutes les catégories » : filtre une liste d'articles par catégorie (ou sous-catégorie). */
export default function FiltreCategorie({
  categories,
  value,
  onChange,
}: {
  categories: Categorie[];
  value: string | undefined;
  onChange: (categorieId: string | undefined) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  // Société sans catégorie (ou catalogue hors ligne sans copie) : rien à filtrer.
  if (categories.length === 0) return null;
  const libelle = value ? chemin(categories, value) || t("Toutes les catégories") : t("Toutes les catégories");
  return (
    <div className="rc-filtre-ligne">
      <FilterChip
        label={libelle}
        active={Boolean(value)}
        ariaLabel={t("Filtrer par catégorie : {nom}", { nom: libelle })}
        onOpen={() => setOuvert(true)}
      />
      <PickerSheet
        isOpen={ouvert}
        title={t("Catégorie")}
        value={value ?? TOUTES}
        options={[{ value: TOUTES, label: t("Toutes les catégories") }, ...optionsFiltre(categories)]}
        onSelect={(v) => {
          onChange(v === TOUTES ? undefined : v);
          setOuvert(false);
        }}
        onDismiss={() => setOuvert(false)}
        searchPlaceholder={t("Rechercher une catégorie…")}
      />
    </div>
  );
}
