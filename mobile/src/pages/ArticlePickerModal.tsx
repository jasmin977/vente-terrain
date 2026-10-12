import { useEffect, useMemo, useRef, useState } from "react";
import { IonIcon, useIonToast } from "@ionic/react";
import { checkmark, searchOutline } from "ionicons/icons";
import type { Article } from "../types/article";
import ArticleImage from "../components/ArticleImage";
import { prixTTC } from "../utils/tarifs";
import { formatAmount } from "../utils/format";
import { articleCorrespond, articleParCode, varianteDuCode } from "../utils/articleSearch";
import { Button, ChargerPlus, EmptyState, Row, SearchField, Sheet, useListeProgressive } from "../ui";
import FiltreCategorie from "../components/FiltreCategorie";
import { filtrerParCategorie } from "../utils/categories";
import { useCategories } from "../utils/useCategories";
import { t } from "../i18n";

interface ArticlePickerModalProps {
  isOpen: boolean;
  articles: Article[];
  selectedIds: string[];
  onConfirm: (articleIds: string[]) => void;
  onDismiss: () => void;
  title?: string;
  confirmLabel?: string;
  /** Information à droite de chaque article (ex. stock dépôt pour l'admin). */
  renderTrailing?: (article: Article) => React.ReactNode;
}

/** Sélection multiple d'articles dans le catalogue (recherche désignation / code / code-barres). */
export default function ArticlePickerModal({
  isOpen,
  articles,
  selectedIds,
  onConfirm,
  onDismiss,
  title = t("Choisir des articles"),
  confirmLabel = t("Ajouter"),
  renderTrailing,
}: ArticlePickerModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [toast] = useIonToast();

  const { categories } = useCategories();
  const [categorie, setCategorie] = useState<string | undefined>(undefined);
  // Articles scannés pendant cette sélection, le dernier en premier : ils remontent en tête de liste.
  const [scannes, setScannes] = useState<string[]>([]);
  const groupeRef = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const trouves = filtrerParCategorie(articles.filter((a) => articleCorrespond(a, query)), categories, categorie, (a) => a);
    if (scannes.length === 0) return trouves;
    const rang = new Map(scannes.map((id, i) => [id, i]));
    const enTete = trouves.filter((a) => rang.has(a.id)).sort((a, b) => rang.get(a.id)! - rang.get(b.id)!);
    return [...enTete, ...trouves.filter((a) => !rang.has(a.id))];
  }, [articles, categories, categorie, query, scannes]);
  const liste = useListeProgressive(filtered, `${query}|${categorie}|${scannes.join(",")}`);
  // Après un scan, la liste revient en haut pour montrer l'article choisi.
  useEffect(() => {
    if (scannes.length > 0) groupeRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [scannes]);

  // Scan rapide : l'article reconnu est coché directement ; sinon le code
  // part dans la recherche pour montrer qu'aucun article ne correspond.
  const handleScan = (code: string) => {
    const article = articleParCode(articles, code);
    if (!article) {
      setQuery(code);
      return;
    }
    setQuery("");
    setScannes((prev) => [article.id, ...prev.filter((id) => id !== article.id)]);
    setSelected((prev) => new Set(prev).add(article.id));
    const variante = varianteDuCode(article, code);
    toast({ message: t("{nom} sélectionné", { nom: variante ? `${article.designation} (${variante})` : article.designation }), duration: 1600, position: "top", cssClass: "rc-toast" });
  };

  const toggle = (articleId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return next;
    });

  return (
    <Sheet
      isOpen={isOpen}
      title={title}
      onWillPresent={() => {
        setQuery("");
        setScannes([]);
        setSelected(new Set(selectedIds));
      }}
      onDismiss={onDismiss}
      toolbar={
        <>
          <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, réf…")} />
          <FiltreCategorie categories={categories} value={categorie} onChange={setCategorie} />
        </>
      }
      footer={
        <Button size="lg" block disabled={selected.size === 0} onClick={() => onConfirm(Array.from(selected))}>
          {confirmLabel} {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      }
    >
      {filtered.length === 0 ? (
        <EmptyState icon={searchOutline} title={t("Aucun article trouvé.")} message={t("Essayez une autre désignation ou un code.")} />
      ) : (
        <div ref={groupeRef} role="group" aria-label={t("Articles")}>
          {liste.visibles.map((article) => {
            const isSelected = selected.has(article.id);
            return (
              <Row
                key={article.id}
                role="checkbox"
                aria-checked={isSelected}
                thumb
                onClick={() => toggle(article.id)}
                leading={<ArticleImage src={article.img} alt="" />}
                title={article.designation}
                meta={
                  <>
                    {[article.code, article.unit].filter(Boolean).map((x) => `${x} · `).join("")}
                    {formatAmount(prixTTC(article))} {t("TND")}
                  </>
                }
                trailing={
                  <span className="rc-inline">
                    {renderTrailing?.(article)}
                    <span className={`rc-check rc-check--box${isSelected ? " rc-check--on" : ""}`} aria-hidden="true">
                      <IonIcon icon={checkmark} />
                    </span>
                  </span>
                }
              />
            );
          })}
          <ChargerPlus reste={liste.reste} onPlus={liste.plus} />
        </div>
      )}
    </Sheet>
  );
}
