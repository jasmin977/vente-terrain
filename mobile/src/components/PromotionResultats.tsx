import { useEffect, useState } from "react";
import { getResultatsPromotion, type ResultatsPromotion } from "../api/promotions";
import { Money, Notice, Section, Segmented, Spinner, TableauDonnees, Tag } from "../ui";
import type { ColonneDonnees } from "../ui";
import { formatDate, parseLocalDate } from "../utils/format";
import { t, tn } from "../i18n";

type LigneArticle = ResultatsPromotion["articles"][number];

const date = (iso: string) => formatDate(parseLocalDate(iso));
const pieces = (n: number) => Number(n.toFixed(3)).toLocaleString("fr-FR");

/** Évolution en % : vert en hausse, rouge en baisse. */
function Evolution({ valeur }: { valeur: number | null }) {
  if (valeur === null) return <span className="rc-res__neutre">{t("nouveau")}</span>;
  const classe = valeur > 0 ? "rc-res__hausse" : valeur < 0 ? "rc-res__baisse" : "rc-res__neutre";
  return (
    <span className={classe}>
      {valeur > 0 ? "▲ +" : valeur < 0 ? "▼ " : ""}
      {valeur} %
    </span>
  );
}

/**
 * Promotion › Résultats : les ventes des articles pendant la promotion, comparées au même nombre de jours juste
 * avant (pièces, CA, gain réel, coût de la promotion), la courbe jour par jour et le détail par article.
 */
export default function PromotionResultats({ promotionId }: { promotionId: string }) {
  const [r, setR] = useState<ResultatsPromotion | null | undefined>(undefined);
  const [erreur, setErreur] = useState<string | null>(null);
  // Comparaison : la même durée juste avant, ou une période plus longue (moyenne par jour).
  const [comparaison, setComparaison] = useState<"meme" | "30" | "60" | "90">("meme");

  useEffect(() => {
    getResultatsPromotion(promotionId, comparaison === "meme" ? undefined : Number(comparaison))
      .then(setR)
      .catch((err) => {
        setR(null);
        setErreur(err instanceof Error ? err.message : t("Résultats indisponibles"));
      });
  }, [promotionId, comparaison]);

  if (r === undefined) return <Spinner />;
  if (erreur) return <Notice tone="warning">{erreur}</Notice>;
  if (r === null) return <Notice tone="info">{t("La promotion n'a pas encore commencé : ses résultats apparaîtront dès le premier jour.")}</Notice>;

  const { avant, pendant } = r.totaux;
  const max = Math.max(1, ...r.serie.map((s) => s.pieces));
  // Comparaison par jour : les deux périodes n'ont pas forcément la même durée.
  const ja = r.periode.avant.jours;
  const jp = r.periode.jours;
  const memeDuree = ja === jp;
  const ecart = (a: number, b: number) => (a > 0 ? Math.round(((b / jp - a / ja) / (a / ja)) * 1000) / 10 : null);
  const parJour = (n: number, j: number) => Number((n / j).toFixed(1)).toLocaleString("fr-FR");

  const colonnes: ColonneDonnees<LigneArticle>[] = [
    {
      id: "article",
      titre: t("Article"),
      principale: true,
      souple: true,
      rendu: (a) => (
        <>
          {a.designation}
          {a.offert && (
            <Tag tone="positive" >
              {t("offert")}
            </Tag>
          )}
        </>
      ),
      tri: (a) => a.designation,
    },
    { id: "avant", titre: t("Pièces avant ({n} j)", { n: ja }), rendu: (a) => pieces(a.avant.pieces), tri: (a) => a.avant.pieces, aligne: "end", largeur: "120px" },
    { id: "pendant", titre: t("Pièces pendant ({n} j)", { n: jp }), rendu: (a) => <strong>{pieces(a.pendant.pieces)}</strong>, tri: (a) => a.pendant.pieces, aligne: "end", largeur: "130px" },
    { id: "evolution", titre: t("Évolution"), rendu: (a) => <Evolution valeur={a.evolution} />, tri: (a) => a.evolution ?? -Infinity, aligne: "end", largeur: "120px" },
    { id: "offertes", titre: t("Offertes"), rendu: (a) => (a.pendant.offertes ? pieces(a.pendant.offertes) : "—"), tri: (a) => a.pendant.offertes, aligne: "end", largeur: "100px" },
    { id: "ca", titre: t("CA TTC"), rendu: (a) => <Money value={a.pendant.ca} />, tri: (a) => a.pendant.ca, aligne: "end", largeur: "130px" },
    {
      id: "gain",
      titre: t("Gain réel"),
      rendu: (a) => <Money value={a.pendant.gain} tone={a.pendant.gain < 0 ? "danger" : "default"} />,
      tri: (a) => a.pendant.gain,
      aligne: "end",
      largeur: "130px",
    },
  ];

  return (
    <div className="rc-res">
      <div className="rc-res__comparaison">
        <span>{t("Comparer avec")}</span>
        <Segmented
          label={t("Comparer avec")}
          value={comparaison}
          onChange={setComparaison}
          options={[
            { value: "meme", label: t("Même durée") },
            { value: "30", label: t("30 jours") },
            { value: "60", label: t("60 jours") },
            { value: "90", label: t("90 jours") },
          ]}
        />
      </div>
      <p className="rc-footnote rc-res__periode">
        {t("Pendant : du {a} au {b} ({n} jours{c}) · comparé à avant : du {d} au {e} ({f} jours){g}.", {
          a: date(r.periode.pendant.debut),
          b: date(r.periode.pendant.fin),
          n: r.periode.jours,
          c: r.periode.enCours ? `, ${t("en cours")}` : "",
          d: date(r.periode.avant.debut),
          e: date(r.periode.avant.fin),
          f: ja,
          g: memeDuree ? "" : ` · ${t("évolutions calculées sur la moyenne par jour")}`,
        })}
      </p>

      <div className="rc-res__chiffres">
        <div className="rc-res__chiffre">
          <span>{t("Pièces vendues")}</span>
          <strong>{pieces(pendant.pieces)}</strong>
          <small>
            <Evolution valeur={r.totaux.evolution} /> ·{" "}
            {memeDuree
              ? t("avant : {n}", { n: pieces(avant.pieces) })
              : t("{p} / jour, avant {a} / jour", { p: parJour(pendant.pieces, jp), a: parJour(avant.pieces, ja) })}
          </small>
        </div>
        <div className="rc-res__chiffre">
          <span>{t("Chiffre d'affaires TTC")}</span>
          <Money value={pendant.ca} size="xl" />
          <small>
            <Evolution valeur={ecart(avant.ca, pendant.ca)} /> · {t("avant")} <Money value={avant.ca} size="sm" />
          </small>
        </div>
        <div className="rc-res__chiffre">
          <span>{t("Gain réel")}</span>
          <Money value={pendant.gain} size="xl" tone={pendant.gain < 0 ? "danger" : "default"} />
          <small>
            {t("avant")} <Money value={avant.gain} size="sm" /> · {t("CA HT − achat HT")}
          </small>
        </div>
        <div className="rc-res__chiffre">
          <span>{t("Coût de la promotion")}</span>
          <Money value={pendant.cout} size="xl" tone={pendant.cout > 0 ? "warning" : "default"} />
          <small>{pendant.offertes > 0 ? tn(pendant.offertes, "{n} pièce offerte · remises · baisses de prix", "{n} pièces offertes · remises · baisses de prix") : t("remises et baisses de prix sur les BL")}</small>
        </div>
      </div>

      <Section label={t("Pièces vendues par jour")}>
        <div className="rc-res__courbe" role="img" aria-label={t("Pièces vendues par jour, avant et pendant la promotion")}>
          {r.serie.map((s) => (
            <div key={s.date} className="rc-res__jour" title={`${date(s.date)} : ${pieces(s.pieces)}`}>
              <span className={`rc-res__barre rc-res__barre--${s.periode}`} style={{ height: `${Math.max(2, (s.pieces / max) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="rc-res__legende">
          <span className="rc-res__cle rc-res__cle--avant">{t("Avant")}</span>
          <span className="rc-res__cle rc-res__cle--pendant">{t("Pendant la promotion")}</span>
        </div>
      </Section>

      <Section label={t("Par article")} aside={`${r.articles.length}`}>
        {r.articles.length === 0 ? (
          <p className="rc-footnote">{t("Aucune vente de ces articles sur les deux périodes.")}</p>
        ) : (
          <TableauDonnees label={t("Résultats par article")} lignes={r.articles} colonnes={colonnes} cle={(a) => a.articleId} chevron={false} triInitial={{ colonne: "pendant", inverse: true }} />
        )}
        <p className="rc-footnote">{t("Pièces : payées + offertes, sur les BL de vente validés (PC et vendeurs). Gain réel au prix d'achat actuel.")}</p>
      </Section>
    </div>
  );
}
