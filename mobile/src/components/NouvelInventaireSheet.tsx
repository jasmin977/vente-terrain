import { useEffect, useMemo, useState } from "react";
import { clipboardOutline } from "ionicons/icons";
import type { SuiviCategorie } from "../types/inventaire";
import { Button, Notice, SearchField, Segmented, Sheet } from "../ui";
import { t, tn } from "../i18n";

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  /** Catégories du catalogue avec leur suivi (dernier inventaire, en cours). */
  categories: SuiviCategorie[];
  /** Catégories cochées à l'ouverture (« Lancer l'inventaire » depuis le suivi). */
  preselection?: string[];
  enCours: boolean;
  /** Vide : tout le dépôt. */
  onCommencer: (categorieIds: string[]) => void;
}

/**
 * Nouvel inventaire du dépôt : tout le dépôt, ou une ou plusieurs catégories (inventaire tournant). Cocher une
 * catégorie prend aussi ses sous-catégories.
 */
export default function NouvelInventaireSheet({ isOpen, onDismiss, categories, preselection, enCours, onCommencer }: Props) {
  const [portee, setPortee] = useState<"categories" | "tout">("categories");
  const [choisies, setChoisies] = useState<Set<string>>(new Set());
  const [recherche, setRecherche] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setPortee("categories");
    setChoisies(new Set(preselection ?? []));
    setRecherche("");
  }, [isOpen, preselection]);

  // Une catégorie cochée couvre ses sous-catégories : elles apparaissent cochées et grisées.
  const couvertes = useMemo(() => {
    const res = new Set<string>();
    let ajoute = true;
    for (const id of choisies) res.add(id);
    while (ajoute) {
      ajoute = false;
      for (const c of categories) {
        if (c.parentId && res.has(c.parentId) && !res.has(c.id)) {
          res.add(c.id);
          ajoute = true;
        }
      }
    }
    return res;
  }, [choisies, categories]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return q ? categories.filter((c) => c.chemin.toLowerCase().includes(q)) : categories;
  }, [categories, recherche]);

  const nbArticles = categories.filter((c) => choisies.has(c.id)).reduce((s, c) => s + c.nbArticles, 0);
  const profondeur = (c: SuiviCategorie) => c.chemin.split(" › ").length - 1;
  const basculer = (id: string) =>
    setChoisies((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const pret = portee === "tout" || choisies.size > 0;

  return (
    <Sheet
      isOpen={isOpen}
      title={t("Nouvel inventaire du dépôt")}
      large
      onDismiss={onDismiss}
      footer={
        <div className="rc-achat__pied rc-achat__pied--totaux">
          <span className="rc-footnote">
            {portee === "tout" ? t("Tout le stock du dépôt") : choisies.size === 0 ? t("Cochez au moins une catégorie.") : tn(nbArticles, "≈ {n} article à compter", "≈ {n} articles à compter")}
          </span>
          <Button size="lg" icon={clipboardOutline} disabled={!pret || enCours} onClick={() => onCommencer(portee === "tout" ? [] : [...choisies])}>
            {t("Commencer l'inventaire")}
          </Button>
        </div>
      }
    >
      <div className="rc-achat__form">
        <Segmented
          label={t("Périmètre")}
          value={portee}
          onChange={setPortee}
          options={[
            { value: "categories", label: t("Par catégorie (recommandé)") },
            { value: "tout", label: t("Tout le dépôt") },
          ]}
        />
        {portee === "tout" ? (
          <Notice tone="info">{t("Tous les articles en stock au dépôt seront à compter. Pour un grand dépôt, préférez un inventaire par catégorie.")}</Notice>
        ) : (
          <>
            <SearchField value={recherche} onChange={setRecherche} placeholder={t("Rechercher une catégorie…")} label={t("Rechercher une catégorie")} />
            <ul className="rc-inv__categories">
              {visibles.map((c) => {
                const heritee = couvertes.has(c.id) && !choisies.has(c.id);
                return (
                  <li key={c.id} style={{ paddingInlineStart: `${12 + profondeur(c) * 22}px` }}>
                    <label className={heritee ? "rc-inv__categorie rc-inv__categorie--heritee" : "rc-inv__categorie"}>
                      <input type="checkbox" className="rc-transfo__case" checked={couvertes.has(c.id)} disabled={heritee || Boolean(c.enCours)} onChange={() => basculer(c.id)} />
                      <span className="rc-inv__categorie-nom">{c.nom}</span>
                      <small>
                        {tn(c.nbArticles, "{n} article", "{n} articles")}
                        {c.enCours ? ` · ${t("inventaire en cours")}` : c.joursDepuis !== null ? ` · ${t("dernier il y a {n} j", { n: c.joursDepuis })}` : ` · ${t("jamais inventoriée")}`}
                      </small>
                    </label>
                  </li>
                );
              })}
              {visibles.length === 0 && <li className="rc-footnote">{t("Aucune catégorie.")}</li>}
            </ul>
          </>
        )}
      </div>
    </Sheet>
  );
}
