import { useEffect, useState } from "react";
import { getHistoriquePrix } from "../api/articles";
import type { PrixHistorique } from "../types/article";
import { formatAmount, joinMeta } from "../utils/format";
import { Group, LineChart, Money, Row, Section, Tag } from "../ui";
import { t } from "../i18n";

const SOURCE: Record<PrixHistorique["source"], string> = {
  CREATION: "Création",
  MODIFICATION: "Modification",
  ENTREE: "Bon d'entrée",
  IMPORT: "Import Excel",
};

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis" }).format(new Date(iso));

/** Variation entre deux prix : « +2,000 » / « −1,500 » (vide si inchangé). */
const variation = (avant: number, apres: number) => {
  const d = Math.round((apres - avant) * 1000) / 1000;
  return d === 0 ? null : `${d > 0 ? "+" : "−"}${formatAmount(Math.abs(d))}`;
};

/**
 * Fiche article (admin) : évolution du prix d'achat et du prix de vente. La courbe montre
 * les prix HT (l'écart entre les deux est la marge) ; la liste détaille chaque changement.
 */
export default function ArticleHistoriquePrix({ articleId }: { articleId: string }) {
  const [lignes, setLignes] = useState<PrixHistorique[] | null>(null);

  useEffect(() => {
    getHistoriquePrix(articleId)
      .then(setLignes)
      .catch(() => setLignes([]));
  }, [articleId]);

  if (!lignes || lignes.length === 0) return null;

  const recent = [...lignes].reverse();
  return (
    <Section label={t("Historique des prix")} aside={lignes.length > 1 ? t("{n} changements", { n: lignes.length - 1 }) : undefined}>
      {lignes.length > 1 && (
        <div className="rc-group rc-group--pad">
          <LineChart
            label={t("Évolution des prix d'achat et de vente HT")}
            nomAchat={t("Achat HT")}
            nomVente={t("Vente HT")}
            points={lignes.map((l) => ({ date: Date.parse(l.date), achat: l.prixAchat, vente: l.prixVenteHT }))}
          />
        </div>
      )}
      <Group>
        {recent.map((l, i) => {
          const avant = recent[i + 1];
          const dAchat = avant ? variation(avant.prixAchat, l.prixAchat) : null;
          const dVente = avant ? variation(avant.prixVenteTTC, l.prixVenteTTC) : null;
          return (
            <Row
              key={l.id}
              title={`${dateFr(l.date)} · ${t(SOURCE[l.source])}${l.reference ? ` ${l.reference}` : ""}`}
              meta={joinMeta([
                t("Achat HT {p}", { p: formatAmount(l.prixAchat) }) + (dAchat ? ` (${dAchat})` : ""),
                l.marge !== null && t("Marge {n} %", { n: l.marge }),
              ])}
              trailing={
                <span className="rc-inline">
                  {dVente && <Tag tone={dVente.startsWith("+") ? "accent" : "neutral"}>{dVente}</Tag>}
                  <Money value={l.prixVenteTTC} />
                </span>
              }
            />
          );
        })}
      </Group>
      <p className="rc-footnote">{t("Prix de vente TTC à droite. Les prix en vigueur depuis la date indiquée.")}</p>
    </Section>
  );
}
