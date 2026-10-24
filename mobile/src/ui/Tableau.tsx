import type { ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { arrowDown, arrowUp } from "ionicons/icons";
import { basculerTri, type CleTri, type TriArticles } from "../utils/triArticles";

/**
 * Colonnes supplémentaires des listes sur grand écran (ordinateur) : la liste devient un tableau
 * (désignation, marque, unité…, valeur). Sur téléphone et petite tablette, rien de tout cela n'est
 * affiché : la ligne garde son titre et son sous-titre habituels.
 */

/**
 * Tri par colonne : critère de chaque colonne (titre, colonnes dans l'ordre, dernière colonne) et tri courant.
 * Un clic sur l'en-tête trie en croissant ; un second clic inverse le sens.
 */
export interface TriColonnes {
  titre?: CleTri;
  colonnes?: (CleTri | undefined)[];
  dernier?: CleTri;
  valeur: TriArticles;
  onChange: (v: TriArticles) => void;
}

/** En-tête du tableau, au-dessus de la liste. `dernier` : intitulé de la colonne de droite (prix, stock…). */
export function EnteteTableau({
  titre,
  colonnes,
  dernier,
  vignette,
  chevron,
  tri,
  largeurs,
  premiere,
}: {
  titre: string;
  colonnes: string[];
  dernier: string;
  /** La liste a une vignette à gauche (photo d'article). */
  vignette?: boolean;
  chevron?: boolean;
  /** Colonnes triables au clic (ordinateur). */
  tri?: TriColonnes;
  /** Largeur (px) de chaque colonne puis de la dernière ; vide : largeur standard. */
  largeurs?: number[];
  /** Colonne placée avant la désignation (ex. le code-barres). */
  premiere?: { label: string; cle?: CleTri; largeur?: number };
}) {
  const cellule = (libelle: string, cle: CleTri | undefined) => {
    if (!tri || !cle) return libelle;
    const actif = tri.valeur.cle === cle;
    return (
      <button
        type="button"
        className={`rc-tableau-tri${actif ? " rc-tableau-tri--actif" : ""}`}
        onClick={() => tri.onChange(basculerTri(tri.valeur, cle))}
        aria-sort={actif ? (tri.valeur.inverse ? "descending" : "ascending") : "none"}
      >
        <span>{libelle}</span>
        {actif && <IonIcon icon={tri.valeur.inverse ? arrowDown : arrowUp} aria-hidden="true" />}
      </button>
    );
  };
  return (
    <div
      className={`rc-tableau-tete${vignette ? " rc-tableau-tete--vignette" : ""}${chevron ? " rc-tableau-tete--chevron" : ""}${premiere ? " rc-tableau-tete--premiere" : ""}`}
      role={tri ? "row" : undefined}
      aria-hidden={tri ? undefined : "true"}
    >
      {premiere && (
        <span
          className="rc-tableau__cellule rc-tableau__premiere"
          style={premiere.largeur ? ({ "--rc-col": `${premiere.largeur}px` } as React.CSSProperties) : undefined}
        >
          {cellule(premiere.label, premiere.cle)}
        </span>
      )}
      <span className="rc-tableau-tete__titre">{cellule(titre, tri?.titre)}</span>
      {colonnes.map((c, i) => (
        <span key={c} className="rc-tableau__cellule" style={largeurs?.[i] ? ({ "--rc-col": `${largeurs[i]}px` } as React.CSSProperties) : undefined}>
          {cellule(c, tri?.colonnes?.[i])}
        </span>
      ))}
      <span
        className="rc-tableau__dernier"
        style={largeurs?.[colonnes.length] ? ({ "--rc-col": `${largeurs[colonnes.length]}px` } as React.CSSProperties) : undefined}
      >
        {cellule(dernier, tri?.dernier)}
      </span>
    </div>
  );
}

/** Cellules d'une ligne ; `dernier` est la valeur de la colonne de droite (montant, quantité). */
export function CellulesTableau({
  valeurs,
  dernier,
  largeurs,
}: {
  valeurs: Array<ReactNode>;
  dernier: ReactNode;
  /** Mêmes largeurs que l'en-tête (colonnes puis dernière). */
  largeurs?: number[];
}) {
  const largeur = (i: number) => (largeurs?.[i] ? ({ "--rc-col": `${largeurs[i]}px` } as React.CSSProperties) : undefined);
  return (
    <>
      {valeurs.map((v, i) => (
        <span key={i} className="rc-tableau__cellule rc-web-only--table" title={typeof v === "string" ? v : undefined} style={largeur(i)}>
          <span className="rc-tableau__texte">{v}</span>
        </span>
      ))}
      <span className="rc-tableau__dernier" style={largeur(valeurs.length)}>
        {dernier}
      </span>
    </>
  );
}
