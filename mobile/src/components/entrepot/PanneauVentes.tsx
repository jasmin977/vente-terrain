import { useMemo, useState } from "react";
import type { EntrepotData, SelectionEntrepot } from "../../types/entrepot";
import { libelleMetrique, type AnalyseVentes, type Classement, type Metrique, type Reco, type Stats } from "../../utils/ventesEntrepot";
import { formatAmount } from "../../utils/format";
import { Group, Money, Notice, Row, Segmented } from "../../ui";
import { t, tn } from "../../i18n";

type Axe = "categorie" | "produit";

/** Valeur d'une ligne de classement pour la métrique choisie. */
const valeurDe = (s: Stats, m: Metrique) => (m === "ca" ? s.ca : m === "marge" ? s.marge : s.surstock);

/** Bloc des ventes d'une case ou d'une étagère : chiffre d'affaires, marge, quantités, surstock. */
export function BlocVentes({ stats, jours }: { stats: Stats; jours: number }) {
  return (
    <>
      <h3 className="rc-entrepot__sous-titre">{t("Ventes ({n} j)", { n: jours })}</h3>
      <Group>
        <Row compact label={t("Chiffre d'affaires TTC")} trailing={<Money value={stats.ca} />} />
        <Row compact label={t("Marge brute HT")} trailing={<Money value={stats.marge} tone={stats.marge < 0 ? "danger" : "default"} />} />
        <Row compact label={t("Pièces vendues")} trailing={<span className="rc-row__value rc-num">{Math.round(stats.qte * 10) / 10}</span>} />
        {stats.surstock > 0 && <Row compact label={t("Surstock (valeur d'achat)")} trailing={<Money value={stats.surstock} tone="warning" />} />}
      </Group>
    </>
  );
}

const joursTexte = (j: number | null) => (j === null ? t("aucune vente") : j > 730 ? t("plus de 2 ans") : t("{n} j de stock", { n: Math.round(j) }));

interface Props {
  data: EntrepotData;
  analyse: AnalyseVentes;
  metrique: Metrique;
  /** Ouvre une case (caméra dessus). */
  onVoirCase: (s: SelectionEntrepot) => void;
  /** Met en évidence (vert) des cases dans la scène. */
  onSurligner: (cases: { rackId: string; niveau: number; travee: number }[]) => void;
}

/** Panneau « Ventes » du plan : totaux, comparaison par catégorie / produit et recommandations. */
export default function PanneauVentes({ data, analyse, metrique, onVoirCase, onSurligner }: Props) {
  const [axe, setAxe] = useState<Axe>("categorie");
  const [selection, setSelection] = useState<string | null>(null);
  const { totaux, jours } = analyse;

  const classement: Classement[] = axe === "categorie" ? analyse.parCategorie : analyse.parProduit;
  const tries = useMemo(() => [...classement].sort((a, b) => valeurDe(b.stats, metrique) - valeurDe(a.stats, metrique)).slice(0, 8), [classement, metrique]);
  const max = Math.max(1e-9, ...tries.map((c) => Math.abs(valeurDe(c.stats, metrique))));

  /** Cases concernées par une ligne du classement (pour les allumer dans la scène). */
  const casesDe = (id: string) => {
    const cases: { rackId: string; niveau: number; travee: number }[] = [];
    for (const r of data.racks) {
      for (const e of r.emplacements) {
        const ok = axe === "categorie" ? (e.article.categorie?.nom ?? "—") === id : e.article.id === id;
        if (ok) cases.push({ rackId: r.id, niveau: e.niveau, travee: e.travee });
      }
    }
    return cases;
  };

  const choisir = (c: Classement) => {
    if (selection === c.id) {
      setSelection(null);
      onSurligner([]);
      return;
    }
    setSelection(c.id);
    const cases = casesDe(c.id);
    onSurligner(cases);
    if (cases[0]) onVoirCase({ type: "case", ...cases[0] });
  };

  const aucuneVente = totaux.caTTC <= 0;
  const reco = (r: Reco, detail: string) => (
    <Row
      key={r.articleId}
      compact
      chevron
      title={r.designation}
      meta={detail}
      onClick={() => onVoirCase({ type: "case", rackId: r.rackId, niveau: r.niveau, travee: r.travee })}
    />
  );

  return (
    <>
      <h3 className="rc-entrepot__sous-titre">{t("Ventes sur {n} jours", { n: jours })}</h3>
      <Group>
        <Row compact label={t("Chiffre d'affaires TTC")} trailing={<Money value={totaux.caTTC} size="lg" />} />
        <Row compact label={t("Marge brute HT")} trailing={<Money value={totaux.margeHT} />} />
        <Row compact label={t("Pièces vendues")} trailing={<span className="rc-row__value rc-num">{Math.round(totaux.quantite * 10) / 10}</span>} />
      </Group>
      {aucuneVente && <Notice tone="info">{t("Aucune vente sur la période : la carte de chaleur reste froide.")}</Notice>}

      <h3 className="rc-entrepot__sous-titre">{t("Comparer")}</h3>
      <Segmented
        label={t("Comparer par")}
        value={axe}
        onChange={(v) => {
          setAxe(v);
          setSelection(null);
          onSurligner([]);
        }}
        options={[
          { value: "categorie", label: t("Catégorie") },
          { value: "produit", label: t("Produit") },
        ]}
      />
      <p className="rc-footnote">{libelleMetrique(metrique)}</p>
      <Group>
        {tries.length === 0 ? (
          <Row compact label={t("Rien à comparer.")} />
        ) : (
          tries.map((c) => {
            const v = valeurDe(c.stats, metrique);
            return (
              <Row
                key={c.id}
                compact
                className={selection === c.id ? "rc-row--choisie" : undefined}
                title={c.label}
                meta={
                  <>
                    <span className="rc-entrepot__barre-rel" aria-hidden="true">
                      <span style={{ width: `${Math.max(2, (Math.abs(v) / max) * 100)}%` }} />
                    </span>
                    {tn(c.stats.nbCases, "{n} case", "{n} cases")}
                    {c.stats.nbCases > 0 && metrique !== "surstock" ? ` · ${formatAmount(v / c.stats.nbCases)} ${t("par case")}` : ""}
                  </>
                }
                trailing={<Money value={v} tone={v < 0 ? "danger" : "default"} />}
                onClick={() => choisir(c)}
              />
            );
          })
        )}
      </Group>

      {analyse.aValoriser.length > 0 && (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("À valoriser : plus de place")}</h3>
          <p className="rc-footnote">{t("Ils vendent beaucoup pour la place qu'ils occupent et partent vite.")}</p>
          <Group>
            {analyse.aValoriser.map((r) =>
              reco(r, `${formatAmount(r.ca)} ${t("TND")} · ${tn(r.nbCases, "{n} case", "{n} cases")} · ${joursTexte(r.couverture)}`),
            )}
          </Group>
        </>
      )}

      {analyse.surstockProduits.length > 0 && (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("Stock élevé, ventes faibles")}</h3>
          <p className="rc-footnote">{t("Plus de 90 jours de ventes en stock : une promotion libérerait de la place et de la trésorerie.")}</p>
          <Group>
            {analyse.surstockProduits.map((r) =>
              reco(r, `${t("{v} TND immobilisés", { v: formatAmount(r.surstock) })} · ${joursTexte(r.couverture)}`),
            )}
          </Group>
        </>
      )}

      {analyse.sectionsFaibles.length > 0 && (
        <>
          <h3 className="rc-entrepot__sous-titre">{t("Sections à améliorer")}</h3>
          <p className="rc-footnote">{t("Des étagères qui vendent peu pour un stock important : à réorganiser.")}</p>
          <Group>
            {analyse.sectionsFaibles.map((s) => (
              <Row
                key={s.rackId}
                compact
                chevron
                title={t("Étagère {nom}", { nom: s.nom })}
                meta={`${formatAmount(s.caParCase)} ${t("TND")} ${t("par case")} · ${t("{v} TND immobilisés", { v: formatAmount(s.surstock) })}`}
                onClick={() => {
                  const r = data.racks.find((x) => x.id === s.rackId);
                  const e = r?.emplacements[0];
                  if (r) onVoirCase(e ? { type: "case", rackId: r.id, niveau: e.niveau, travee: e.travee } : { type: "rack", rackId: r.id });
                  onSurligner(r ? r.emplacements.map((x) => ({ rackId: r.id, niveau: x.niveau, travee: x.travee })) : []);
                }}
              />
            ))}
          </Group>
        </>
      )}
      <p className="rc-footnote">
        {t("Marge calculée avec le prix d'achat actuel ; les articles sans prix d'achat n'y comptent pas. Les cases sans vente restent froides ({n}).", {
          n: [...analyse.parCase.entries()].filter(([, c]) => c.stats.ca <= 0).length,
        })}
      </p>
    </>
  );
}

