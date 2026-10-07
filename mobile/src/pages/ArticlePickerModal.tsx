import { useMemo, useState } from "react";
import { IonIcon, useIonToast } from "@ionic/react";
import { checkmark, searchOutline } from "ionicons/icons";
import type { Article } from "../types/article";
import ArticleImage from "../components/ArticleImage";
import { formatAmount } from "../utils/format";
import { articleCorrespond, articleParCode } from "../utils/articleSearch";
import { Button, EmptyState, Row, SearchField, Sheet } from "../ui";
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

  const filtered = useMemo(() => articles.filter((a) => articleCorrespond(a, query)), [articles, query]);

  // Scan rapide : l'article reconnu est coché directement ; sinon le code
  // part dans la recherche pour montrer qu'aucun article ne correspond.
  const handleScan = (code: string) => {
    const article = articleParCode(articles, code);
    if (!article) {
      setQuery(code);
      return;
    }
    setQuery("");
    setSelected((prev) => new Set(prev).add(article.id));
    toast({ message: t("{nom} sélectionné", { nom: article.designation }), duration: 1600, position: "top", cssClass: "rc-toast" });
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
        setSelected(new Set(selectedIds));
      }}
      onDismiss={onDismiss}
      toolbar={
        <SearchField value={query} onChange={setQuery} onScan={handleScan} placeholder={t("Désignation, marque, code…")} />
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
        <div role="group" aria-label={t("Articles")}>
          {filtered.map((article) => {
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
                    {article.code}
                    {article.unit ? ` · ${article.unit}` : ""} · {formatAmount(article.prixVente)} {t("TND")}
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
        </div>
      )}
    </Sheet>
  );
}
