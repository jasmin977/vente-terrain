import { useMemo, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { IonIcon } from "@ionic/react";
import { arrowDown, arrowUp, chevronForward } from "ionicons/icons";

/**
 * Tableau de données pour ordinateur : une colonne par information, en-têtes cliquables (tri croissant
 * puis décroissant) et ligne cliquable. Les filtres sont posés par l'écran, au-dessus.
 */
export interface ColonneDonnees<T> {
  id: string;
  titre: string;
  /** Contenu de la cellule. */
  rendu: (ligne: T) => ReactNode;
  /** Valeur de tri ; absente : colonne non triable. */
  tri?: (ligne: T) => string | number | null | undefined;
  aligne?: "start" | "center" | "end";
  /** Largeur CSS (ex. « 140px ») ; par défaut la colonne s'adapte. */
  largeur?: string;
  /** Colonne principale (texte en gras). */
  principale?: boolean;
  /** Le texte peut passer à la ligne (noms longs) au lieu d'élargir le tableau. */
  souple?: boolean;
}

const comparer = new Intl.Collator("fr", { numeric: true, sensitivity: "base" }).compare;

interface Props<T> {
  lignes: T[];
  colonnes: ColonneDonnees<T>[];
  cle: (ligne: T) => string;
  /** Clic ou Entrée sur une ligne ; l'événement permet de lire Ctrl / Maj (sélection multiple). */
  onOuvrir?: (ligne: T, e: MouseEvent | KeyboardEvent) => void;
  /** Ligne mise en évidence (sélectionnée). */
  selectionnee?: (ligne: T) => boolean;
  /** Ligne atténuée (document supprimé, article à zéro…). */
  attenuee?: (ligne: T) => boolean;
  /** Tri de départ. */
  triInitial?: { colonne: string; inverse?: boolean };
  /** Nom du tableau (lecteurs d'écran). */
  label: string;
  /** Ligne de total, sous le tableau. */
  pied?: ReactNode;
  /** Flèche en fin de ligne cliquable (par défaut : oui). */
  chevron?: boolean;
}

export default function TableauDonnees<T>({ lignes, colonnes, cle, onOuvrir, selectionnee, attenuee, triInitial, label, pied, chevron = true }: Props<T>) {
  const [tri, setTri] = useState<{ colonne: string; inverse: boolean }>({ colonne: triInitial?.colonne ?? "", inverse: triInitial?.inverse ?? false });

  const triees = useMemo(() => {
    const col = colonnes.find((c) => c.id === tri.colonne);
    if (!col?.tri) return lignes;
    const val = col.tri;
    const sens = tri.inverse ? -1 : 1;
    return [...lignes].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      // Valeur absente : toujours en fin de liste.
      if ((x == null || x === "") !== (y == null || y === "")) return x == null || x === "" ? 1 : -1;
      if (typeof x === "number" && typeof y === "number") return sens * (x - y);
      return sens * comparer(String(x ?? ""), String(y ?? ""));
    });
  }, [lignes, colonnes, tri]);

  const basculer = (id: string) => setTri((t) => (t.colonne === id ? { colonne: id, inverse: !t.inverse } : { colonne: id, inverse: false }));

  return (
    <div className="rc-tdonnees">
      <table aria-label={label}>
        <thead>
          <tr>
            {colonnes.map((c) => {
              const actif = tri.colonne === c.id;
              return (
                <th
                  key={c.id}
                  scope="col"
                  style={{ width: c.largeur, textAlign: c.aligne ?? "start" }}
                  aria-sort={actif ? (tri.inverse ? "descending" : "ascending") : undefined}
                >
                  {c.tri ? (
                    <button type="button" className={`rc-tdonnees__tri${actif ? " rc-tdonnees__tri--actif" : ""}`} onClick={() => basculer(c.id)}>
                      <span>{c.titre}</span>
                      {actif && <IonIcon icon={tri.inverse ? arrowDown : arrowUp} aria-hidden="true" />}
                    </button>
                  ) : (
                    c.titre
                  )}
                </th>
              );
            })}
            {onOuvrir && chevron && <th aria-hidden="true" className="rc-tdonnees__chev" />}
          </tr>
        </thead>
        <tbody>
          {triees.map((l) => (
            <tr
              key={cle(l)}
              className={`${attenuee?.(l) ? "rc-tdonnees__ligne--attenuee" : ""}${selectionnee?.(l) ? " rc-tdonnees__ligne--selection" : ""}${onOuvrir ? " rc-tdonnees__ligne--lien" : ""}`}
              tabIndex={onOuvrir ? 0 : undefined}
              onClick={onOuvrir ? (e) => onOuvrir(l, e) : undefined}
              // Seulement quand la ligne elle-même a le focus : Entrée dans un champ de la ligne ne doit pas la rouvrir.
              onKeyDown={onOuvrir ? (e) => e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOuvrir(l, e)) : undefined}
            >
              {colonnes.map((c) => (
                <td key={c.id} style={{ textAlign: c.aligne ?? "start" }} className={`${c.principale ? "rc-tdonnees__principale" : ""}${c.souple ? " rc-tdonnees__souple" : ""}`}>
                  {c.rendu(l)}
                </td>
              ))}
              {onOuvrir && chevron && (
                <td className="rc-tdonnees__chev" aria-hidden="true">
                  <IonIcon icon={chevronForward} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {pied && <div className="rc-tdonnees__pied">{pied}</div>}
    </div>
  );
}
