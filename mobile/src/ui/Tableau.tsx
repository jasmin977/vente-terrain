import type { ReactNode } from "react";

/**
 * Colonnes supplémentaires des listes sur grand écran (ordinateur) : la liste devient un tableau
 * (désignation, marque, unité…, valeur). Sur téléphone et petite tablette, rien de tout cela n'est
 * affiché : la ligne garde son titre et son sous-titre habituels.
 */

/** En-tête du tableau, au-dessus de la liste. `dernier` : intitulé de la colonne de droite (prix, stock…). */
export function EnteteTableau({
  titre,
  colonnes,
  dernier,
  vignette,
  chevron,
}: {
  titre: string;
  colonnes: string[];
  dernier: string;
  /** La liste a une vignette à gauche (photo d'article). */
  vignette?: boolean;
  chevron?: boolean;
}) {
  return (
    <div className={`rc-tableau-tete${vignette ? " rc-tableau-tete--vignette" : ""}${chevron ? " rc-tableau-tete--chevron" : ""}`} aria-hidden="true">
      <span className="rc-tableau-tete__titre">{titre}</span>
      {colonnes.map((c) => (
        <span key={c} className="rc-tableau__cellule">
          {c}
        </span>
      ))}
      <span className="rc-tableau__dernier">{dernier}</span>
    </div>
  );
}

/** Cellules d'une ligne ; `dernier` est la valeur de la colonne de droite (montant, quantité). */
export function CellulesTableau({ valeurs, dernier }: { valeurs: Array<string | null | undefined>; dernier: ReactNode }) {
  return (
    <>
      {valeurs.map((v, i) => (
        <span key={i} className="rc-tableau__cellule rc-web-only--table" title={v ?? undefined}>
          {v}
        </span>
      ))}
      <span className="rc-tableau__dernier">{dernier}</span>
    </>
  );
}
