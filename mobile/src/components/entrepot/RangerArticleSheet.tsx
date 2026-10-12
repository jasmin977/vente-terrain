import { useEffect, useMemo, useState } from "react";
import { IonAlert } from "@ionic/react";
import { getStockDepot } from "../../api/stock";
import type { EntrepotData } from "../../types/entrepot";
import type { StockDepotItem } from "../../types/stock";
import { articleCorrespond } from "../../utils/articleSearch";
import { pieces } from "../../utils/format";
import ArticleImage from "../ArticleImage";
import { ChargerPlus, EmptyState, Row, SearchField, Sheet, useListeProgressive } from "../../ui";
import { cubeOutline } from "ionicons/icons";
import { t } from "../../i18n";

/** Choix de l'article à ranger dans une case : stock du dépôt, ce qui est déjà rangé, puis la quantité. */
export default function RangerArticleSheet({
  isOpen,
  data,
  onDismiss,
  onRanger,
}: {
  isOpen: boolean;
  data: EntrepotData;
  onDismiss: () => void;
  onRanger: (articleId: string, quantite: number) => void | Promise<void>;
}) {
  const [stock, setStock] = useState<StockDepotItem[]>([]);
  const [recherche, setRecherche] = useState("");
  const [choix, setChoix] = useState<StockDepotItem | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setRecherche("");
    getStockDepot()
      .then((s) => setStock(s.filter((l) => l.quantite > 0)))
      .catch(() => setStock([]));
  }, [isOpen]);

  const ranges = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.racks) for (const e of r.emplacements) m.set(e.article.id, (m.get(e.article.id) ?? 0) + e.quantite);
    return m;
  }, [data]);

  const filtres = useMemo(() => stock.filter((l) => articleCorrespond(l.article, recherche)), [stock, recherche]);
  const liste = useListeProgressive(filtres, recherche);
  const aRanger = (l: StockDepotItem) => Math.max(0, Math.round((l.quantite - (ranges.get(l.articleId) ?? 0)) * 1000) / 1000);

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={t("Ranger un article")}
        onDismiss={onDismiss}
        toolbar={<SearchField value={recherche} onChange={setRecherche} placeholder={t("Désignation, marque, réf…")} />}
      >
        {filtres.length === 0 ? (
          <EmptyState icon={cubeOutline} title={t("Aucun article trouvé.")} />
        ) : (
          <div role="list">
            {liste.visibles.map((l) => {
              const reste = aRanger(l);
              return (
                <Row
                  key={l.articleId}
                  thumb
                  chevron
                  leading={<ArticleImage src={l.article.img} alt="" />}
                  title={l.article.designation}
                  meta={t("Stock {s} · rangé {r}", { s: l.quantite, r: ranges.get(l.articleId) ?? 0 })}
                  trailing={reste > 0 ? <span className="rc-qty"><span className="rc-qty__n">{reste}</span> {pieces(reste)} {t("à ranger")}</span> : undefined}
                  onClick={() => setChoix(l)}
                />
              );
            })}
            <ChargerPlus reste={liste.reste} onPlus={liste.plus} />
          </div>
        )}
      </Sheet>
      <IonAlert
        isOpen={choix !== null}
        onDidDismiss={() => setChoix(null)}
        header={choix?.article.designation}
        message={t("Quantité à ranger dans cette case (en pièces).")}
        inputs={[{ name: "q", type: "number", min: 1, value: choix ? Math.max(1, aRanger(choix)) : 1 }]}
        buttons={[
          { text: t("Annuler"), role: "cancel" },
          {
            text: t("Ranger"),
            handler: (d: { q?: string }) => {
              const q = Number(String(d.q ?? "").replace(",", "."));
              if (choix && Number.isFinite(q) && q > 0) {
                void Promise.resolve(onRanger(choix.articleId, q)).then(onDismiss);
              }
            },
          },
        ]}
      />
    </>
  );
}
