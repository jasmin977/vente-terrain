import { useMemo, useState } from "react";
import type { StockDepotItem, VentesParArticle } from "../types/stock";
import { formatAmount, formatColis, pieces } from "../utils/format";
import { BarRanking, Group, Money, Notice, Row, Section, Segmented } from "../ui";
import type { BarRankingItem } from "../ui/BarRanking";
import { t, tn } from "../i18n";

type Mesure = "stock" | "ventes";
type Ordre = "top" | "moins";

const TAILLE = 5;

/**
 * Tableau de bord du dépôt : valeur du stock (prix de vente et d'achat, HT)
 * et classements des articles les plus / moins en stock et vendus.
 */
export default function DepotDashboard({ depot, ventes }: { depot: StockDepotItem[]; ventes: VentesParArticle | null }) {
  const [mesure, setMesure] = useState<Mesure>("stock");
  const [ordre, setOrdre] = useState<Ordre>("top");

  const valeurs = useMemo(() => {
    let vente = 0;
    let achat = 0;
    let ruptures = 0;
    // Articles en stock sans prix d'achat saisi : la valeur d'achat (et donc la
    // marge) serait sous-estimée, on le signale au lieu d'afficher une fausse marge.
    let sansPrixAchat = 0;
    for (const d of depot) {
      const q = Math.max(0, d.quantite);
      if (q === 0) ruptures++;
      else if (!(Number(d.article.prixAchat) > 0)) sansPrixAchat++;
      vente += q * Number(d.article.prixVente);
      achat += q * Number(d.article.prixAchat);
    }
    return { vente, achat, marge: vente - achat, ruptures, sansPrixAchat };
  }, [depot]);

  const classement = useMemo<BarRankingItem[]>(() => {
    if (mesure === "stock") {
      // Articles présents au dépôt (les ruptures sont comptées à part).
      const presents = depot.filter((d) => d.quantite > 0);
      presents.sort((a, b) => (ordre === "top" ? b.quantite - a.quantite : a.quantite - b.quantite));
      return presents.slice(0, TAILLE).map((d) => {
        const c = Number(d.article.colisage) || 1;
        return {
          id: d.articleId,
          label: d.article.designation,
          value: d.quantite,
          display: `${d.quantite} ${pieces(d.quantite)}`,
          sub: c > 1 && d.quantite >= c ? formatColis(d.quantite, c) : undefined,
        };
      });
    }
    // Ventes : tous les articles du catalogue, 0 si non vendu sur la période.
    const parArticle = new Map(ventes?.ventes.map((v) => [v.articleId, v]) ?? []);
    const lignes = depot.map((d) => ({
      d,
      quantite: parArticle.get(d.articleId)?.quantite ?? 0,
      montant: parArticle.get(d.articleId)?.montantHT ?? 0,
    }));
    lignes.sort((a, b) => (ordre === "top" ? b.quantite - a.quantite : a.quantite - b.quantite));
    return lignes.slice(0, TAILLE).map(({ d, quantite, montant }) => ({
      id: d.articleId,
      label: d.article.designation,
      value: quantite,
      display: `${quantite} ${pieces(quantite)}`,
      sub: quantite > 0 ? t("{m} TND HT", { m: formatAmount(montant) }) : t("Aucune vente"),
    }));
  }, [depot, ventes, mesure, ordre]);

  // Les barres « moins » gardent l'échelle de l'ensemble, pour ne pas faire
  // paraître 3 pièces aussi longues que 300.
  const echelle = useMemo(() => {
    if (mesure === "stock") return Math.max(1, ...depot.map((d) => d.quantite));
    return Math.max(1, ...(ventes?.ventes.map((v) => v.quantite) ?? [1]));
  }, [depot, ventes, mesure]);

  const margePct = valeurs.vente > 0 ? Math.round((valeurs.marge / valeurs.vente) * 100) : 0;
  const titreClassement =
    mesure === "stock"
      ? ordre === "top"
        ? t("Articles les plus en stock")
        : t("Articles les moins en stock")
      : ordre === "top"
        ? t("Articles les plus vendus ({n} j)", { n: ventes?.jours ?? 30 })
        : t("Articles les moins vendus ({n} j)", { n: ventes?.jours ?? 30 });

  return (
    <>
      <Section label={t("Valeur du dépôt")}>
        <Group>
          <Row compact label={t("Au prix de vente HT")} trailing={<Money value={valeurs.vente} size="lg" />} />
          <Row
            compact
            label={t("Au prix d'achat HT")}
            trailing={<Money value={valeurs.achat} size="lg" tone={valeurs.sansPrixAchat > 0 ? "warning" : "default"} />}
          />
          {valeurs.sansPrixAchat === 0 && (
            <Row
              compact
              label={t("Marge potentielle")}
              trailing={
                <>
                  <Money value={valeurs.marge} />
                  {valeurs.vente > 0 && <span className="rc-row__note">{t("{p} % du prix de vente", { p: margePct })}</span>}
                </>
              }
            />
          )}
        </Group>
        {valeurs.sansPrixAchat > 0 && (
          <Notice tone="warning">
            {tn(
              valeurs.sansPrixAchat,
              "{n} article en stock sans prix d'achat : la valeur d'achat est incomplète et la marge n'est pas calculée.",
              "{n} articles en stock sans prix d'achat : la valeur d'achat est incomplète et la marge n'est pas calculée."
            )}
          </Notice>
        )}
        {valeurs.ruptures > 0 && (
          <p className="rc-kpi__foot">
            {tn(valeurs.ruptures, "{n} article en rupture au dépôt.", "{n} articles en rupture au dépôt.")}
          </p>
        )}
      </Section>

      <Section label={t("Classement")}>
        <div className="rc-group rc-group--pad">
          <div className="rc-fields">
            <Segmented
              label={t("Mesure")}
              value={mesure}
              onChange={setMesure}
              options={[
                { value: "stock", label: t("En stock") },
                { value: "ventes", label: t("Ventes"), hint: t("{n} derniers jours", { n: ventes?.jours ?? 30 }) },
              ]}
            />
            <Segmented
              label={t("Ordre")}
              value={ordre}
              onChange={setOrdre}
              options={[
                { value: "top", label: t("Top {n}", { n: TAILLE }) },
                { value: "moins", label: t("Moins {n}", { n: TAILLE }) },
              ]}
            />
            <p className="rc-rank__title">{titreClassement}</p>
            {classement.length === 0 ? (
              <p className="rc-footnote">{t("Aucun article en stock au dépôt.")}</p>
            ) : (
              <BarRanking
                label={titreClassement}
                items={classement}
                max={echelle}
                tone={mesure === "stock" ? "ink" : "accent"}
              />
            )}
          </div>
        </div>
      </Section>
    </>
  );
}
