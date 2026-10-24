import { useCallback, useEffect, useState, type ReactNode } from "react";
import { calendarOutline } from "ionicons/icons";
import { getLotsArticle, type LotsArticle } from "../api/stock";
import { Button, Section, TableauDonnees, Tag } from "../ui";
import type { ColonneDonnees } from "../ui";
import { formatColis, formatDate, pieces } from "../utils/format";
import DaterLotsSheet from "./DaterLotsSheet";
import type { ArticleADater } from "../types/lot";
import { t, tn } from "../i18n";

type Lot = LotsArticle["lots"][number];

/** « BL SLS-1502 » : le type devant le numéro, sans le répéter quand le papier le porte déjà. */
function documentDe(p: NonNullable<Lot["provenance"]>): string {
  const type = p.type === "BL" ? "BL" : p.type === "ENTREE" ? t("B° Entrée") : t("Facture");
  const prefixe = p.type === "FACTURE" ? "FA" : p.type === "BL" ? "BL" : "";
  return prefixe && p.numero.toUpperCase().startsWith(prefixe) ? p.numero : `${type} ${p.numero}`;
}

/**
 * Fiche article › Stock et expiration : les chiffres clés (dépôt, camions, stock minimum) puis le tableau des
 * pièces par date d'expiration (la plus proche d'abord), avec d'où vient chaque date.
 */
export default function ArticleStockLots({ articleId, stockMini }: { articleId: string; stockMini?: ReactNode }) {
  const [data, setData] = useState<LotsArticle | null>(null);
  const [aDater, setADater] = useState<ArticleADater | null>(null);

  const charger = useCallback(() => {
    getLotsArticle(articleId)
      .then(setData)
      .catch(() => setData(null));
  }, [articleId]);
  useEffect(charger, [charger]);

  if (!data) return null;
  const colisage = Number(data.article.colisage) || 1;
  const quantite = (q: number) => (colisage > 1 ? `${q} ${pieces(q)} · ${formatColis(q, colisage)}` : `${q} ${pieces(q)}`);
  const totalCamions = data.camions.reduce((s, c) => s + c.quantite, 0);

  const etat = (l: Lot) => {
    if (l.statut === "SANS_DATE")
      return data.perissable ? (
        <Button variant="secondary" icon={calendarOutline} onClick={() => setADater({ articleId, article: data.article, quantiteSansDate: l.quantite })}>
          {t("Dater")}
        </Button>
      ) : (
        <Tag tone="neutral">{t("Non suivi")}</Tag>
      );
    if (l.statut === "EXPIRE") return <Tag tone="danger" dot>{t("Expiré depuis {n} j", { n: -(l.joursRestants ?? 0) })}</Tag>;
    return (
      <Tag tone={l.statut === "PROCHE" ? "warning" : "positive"} dot>
        {l.joursRestants === 0 ? t("Expire aujourd'hui") : tn(l.joursRestants ?? 0, "Dans {n} jour", "Dans {n} jours")}
      </Tag>
    );
  };

  const colonnes: ColonneDonnees<Lot>[] = [
    {
      id: "date",
      titre: t("Expiration"),
      principale: true,
      rendu: (l) => (l.dateExpiration ? formatDate(l.dateExpiration) : t("Sans date")),
      largeur: "130px",
    },
    { id: "qte", titre: t("Quantité"), rendu: (l) => <strong>{quantite(l.quantite)}</strong>, aligne: "end", largeur: "150px" },
    { id: "etat", titre: t("État"), rendu: etat, largeur: "150px" },
    {
      id: "provenance",
      titre: t("Provenance"),
      souple: true,
      rendu: (l) =>
        l.provenance ? (
          <span className="rc-lots__provenance">
            <strong>{documentDe(l.provenance)}</strong>
            <span>
              {formatDate(l.provenance.date)}
              {l.provenance.fournisseur ? ` · ${l.provenance.fournisseur}` : ""}
            </span>
          </span>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <>
      <div className="rc-stock-chiffres">
        <div className="rc-stock-chiffre">
          <span className="rc-stock-chiffre__titre">{t("Dépôt")}</span>
          <strong className="rc-stock-chiffre__valeur">
            {data.depot} <small>{pieces(data.depot)}</small>
          </strong>
          {colisage > 1 && <span className="rc-stock-chiffre__note">{formatColis(data.depot, colisage)}</span>}
        </div>
        <div className="rc-stock-chiffre">
          <span className="rc-stock-chiffre__titre">{t("Camions")}</span>
          <strong className="rc-stock-chiffre__valeur">
            {totalCamions} <small>{pieces(totalCamions)}</small>
          </strong>
          <span className="rc-stock-chiffre__note">
            {data.camions.length === 0 ? t("Aucun camion n'en a") : data.camions.map((c) => `${c.vendeur} : ${c.quantite}`).join(" · ")}
          </span>
        </div>
        {stockMini && <div className="rc-stock-chiffre rc-stock-chiffre--champ">{stockMini}</div>}
      </div>

      <Section label={t("Stock du dépôt par date d'expiration")} aside={data.lots.length > 0 ? tn(data.lots.length, "{n} date", "{n} dates") : undefined}>
        {data.lots.length === 0 ? (
          <p className="rc-footnote">{data.depot > 0 ? t("Aucune date enregistrée pour ce stock.") : t("Rien en stock au dépôt.")}</p>
        ) : (
          <TableauDonnees label={t("Stock par date d'expiration")} lignes={data.lots} colonnes={colonnes} cle={(l) => l.dateExpiration ?? "sans-date"} chevron={false} />
        )}
      </Section>

      <DaterLotsSheet
        article={aDater}
        onDismiss={() => setADater(null)}
        onFait={() => {
          setADater(null);
          charger();
        }}
      />
    </>
  );
}
