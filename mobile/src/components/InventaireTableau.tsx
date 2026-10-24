import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import type { LigneInventaire } from "../types/inventaire";
import TableauDonnees, { type ColonneDonnees } from "../ui/TableauDonnees";
import { t } from "../i18n";

export interface InventaireTableauHandle {
  /** Met le curseur dans la cellule « Quantité comptée » de cet article. */
  focus: (articleId: string) => void;
  /** Curseur sur la première ligne du tableau. */
  focusPremiere: () => void;
}

interface Props {
  lignes: LigneInventaire[];
  /** Comptage en cours : la quantité comptée est saisissable. */
  modifiable: boolean;
  /** Enregistre le comptage d'un article (appelé à Entrée, ou en quittant la cellule). */
  onSauver: (articleId: string, quantite: number) => void;
}

const classeEtat = (l: LigneInventaire) => {
  if (l.quantiteReelle === null) return "";
  if (l.quantiteReelle === l.quantiteTheorique) return " rc-cnt--conforme";
  return l.quantiteReelle < l.quantiteTheorique ? " rc-cnt--manque" : " rc-cnt--surplus";
};

/**
 * Comptage d'inventaire sur grand écran : un tableau code-barres, désignation, quantité comptée (seule cellule
 * modifiable) et quantité attendue. Entrée enregistre la saisie et passe à la ligne suivante ; Entrée sur une
 * cellule vide compte 0. Vert : conforme, rouge : manque, orange : surplus.
 */
const InventaireTableau = forwardRef<InventaireTableauHandle, Props>(function InventaireTableau({ lignes, modifiable, onSauver }, ref) {
  const champs = useRef(new Map<string, HTMLInputElement>());
  // Saisie en cours, par article (absente : on affiche la quantité déjà comptée).
  const [saisies, setSaisies] = useState<Record<string, string>>({});

  const focus = useCallback((articleId: string) => {
    const c = champs.current.get(articleId);
    c?.focus();
    c?.select();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      focus,
      focusPremiere: () => {
        if (lignes[0]) focus(lignes[0].articleId);
      },
    }),
    [focus, lignes],
  );

  const valeur = (l: LigneInventaire) => saisies[l.articleId] ?? (l.quantiteReelle !== null ? String(l.quantiteReelle) : "");

  const oublier = (articleId: string) =>
    setSaisies((s) => {
      const reste = { ...s };
      delete reste[articleId];
      return reste;
    });

  const valider = (l: LigneInventaire, index: number, avancer: boolean) => {
    const brut = (saisies[l.articleId] ?? (l.quantiteReelle !== null ? String(l.quantiteReelle) : "")).trim();
    // Entrée sur une cellule vide : 0 pièce comptée.
    const q = brut === "" ? 0 : Number(brut.replace(",", "."));
    if (!Number.isFinite(q) || q < 0) return;
    if (l.quantiteReelle !== q) onSauver(l.articleId, q);
    oublier(l.articleId);
    if (avancer) {
      const suivante = lignes[index + 1];
      if (suivante) focus(suivante.articleId);
      else champs.current.get(l.articleId)?.blur();
    }
  };

  const colonnes: ColonneDonnees<LigneInventaire>[] = [
    { id: "code", titre: t("Code-barres"), rendu: (l) => l.article.codeBarre ?? "—", largeur: "170px" },
    { id: "designation", titre: t("Désignation"), principale: true, souple: true, rendu: (l) => l.article.designation },
    {
      id: "comptee",
      titre: t("Quantité comptée (en pièces)"),
      largeur: "230px",
      aligne: "center",
      rendu: (l) => {
        const index = lignes.findIndex((x) => x.articleId === l.articleId);
        return modifiable ? (
          <input
            ref={(el) => {
              if (el) champs.current.set(l.articleId, el);
              else champs.current.delete(l.articleId);
            }}
            className={`rc-cnt${classeEtat(l)}`}
            type="number"
            inputMode="numeric"
            min={0}
            step="any"
            value={valeur(l)}
            placeholder="—"
            aria-label={t("Quantité comptée de {nom}", { nom: l.article.designation })}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setSaisies((s) => ({ ...s, [l.articleId]: e.target.value }))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                valider(l, index, true);
              } else if (e.key === "ArrowDown" && lignes[index + 1]) {
                e.preventDefault();
                focus(lignes[index + 1].articleId);
              } else if (e.key === "ArrowUp" && index > 0) {
                e.preventDefault();
                focus(lignes[index - 1].articleId);
              } else if (e.key === "Escape") {
                oublier(l.articleId);
                e.currentTarget.blur();
              }
            }}
            // Quitter la cellule avec une saisie non validée l'enregistre aussi : rien ne se perd.
            onBlur={() => {
              if (saisies[l.articleId] !== undefined && saisies[l.articleId].trim() !== "") valider(l, index, false);
              else oublier(l.articleId);
            }}
          />
        ) : (
          <span className={`rc-cnt rc-cnt--lecture${classeEtat(l)}`}>{l.quantiteReelle ?? "—"}</span>
        );
      },
    },
    { id: "attendue", titre: t("Quantité attendue (en pièces)"), largeur: "230px", aligne: "center", rendu: (l) => <span className="rc-cnt__attendue">{l.quantiteTheorique}</span> },
    {
      id: "ecart",
      titre: t("Écart"),
      largeur: "150px",
      aligne: "center",
      rendu: (l) => {
        if (l.quantiteReelle === null) return <span className="rc-ecart rc-ecart--vide">—</span>;
        const e = Math.round((l.quantiteReelle - l.quantiteTheorique) * 1000) / 1000;
        if (e === 0) return <span className="rc-ecart rc-ecart--conforme">{t("Conforme")}</span>;
        return <span className={`rc-ecart ${e < 0 ? "rc-ecart--manque" : "rc-ecart--surplus"}`}>{e < 0 ? `−${-e}` : `+${e}`}</span>;
      },
    },
  ];

  return (
    <TableauDonnees
      label={t("Comptage de l'inventaire")}
      lignes={lignes}
      colonnes={colonnes}
      cle={(l) => l.articleId}
      chevron={false}
      onOuvrir={modifiable ? (l) => focus(l.articleId) : undefined}
      pied={t("Entrée valide la quantité et passe à la ligne suivante ; Entrée sur une cellule vide compte 0.")}
    />
  );
});

export default InventaireTableau;
