import { useEffect, useState } from "react";
import { getHistoriquePrix } from "../api/articles";
import type { PrixHistorique } from "../types/article";
import { formatAmount } from "../utils/format";
import { Group, LineChart, Money, Row, Section, Tag } from "../ui";
import { t } from "../i18n";

const SOURCE: Record<PrixHistorique["source"], string> = {
  CREATION: "Création",
  MODIFICATION: "Modification",
  ENTREE: "Réception",
  IMPORT: "Import Excel",
};

const dateFr = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Africa/Tunis" }).format(new Date(iso));

/** Variation entre deux prix : « +2,000 » / « −1,500 » (null si inchangé). */
const variation = (avant: number, apres: number) => {
  const d = Math.round((apres - avant) * 1000) / 1000;
  return d === 0 ? null : `${d > 0 ? "+" : "−"}${formatAmount(Math.abs(d))}`;
};

/** Un prix dans le temps : courbe, prix actuel, plus bas, plus haut et évolution depuis le premier relevé. */
function CartePrix({ titre, cle, lignes, valeur }: { titre: string; cle: "achat" | "vente"; lignes: PrixHistorique[]; valeur: (l: PrixHistorique) => number }) {
  const valeurs = lignes.map(valeur);
  const actuel = valeurs[valeurs.length - 1];
  const premier = valeurs[0];
  const evolution = premier > 0 ? Math.round(((actuel - premier) / premier) * 1000) / 10 : null;
  return (
    <div className="rc-prix-carte">
      <div className="rc-prix-carte__tete">
        <span>{titre}</span>
        {evolution !== null && evolution !== 0 && (
          <Tag tone={(cle === "achat") === evolution > 0 ? "warning" : "positive"}>
            {evolution > 0 ? "+" : ""}
            {evolution} %
          </Tag>
        )}
      </div>
      <Money value={actuel} size="xl" />
      <LineChart
        label={titre}
        nomAchat={titre}
        nomVente={titre}
        series={[cle]}
        points={lignes.map((l) => ({ date: Date.parse(l.date), achat: l.prixAchat, vente: l.prixVenteTTC }))}
      />
      <dl className="rc-prix-carte__chiffres">
        <div>
          <dt>{t("Plus bas")}</dt>
          <dd>
            <Money value={Math.min(...valeurs)} size="sm" />
          </dd>
        </div>
        <div>
          <dt>{t("Plus haut")}</dt>
          <dd>
            <Money value={Math.max(...valeurs)} size="sm" />
          </dd>
        </div>
        <div>
          <dt>{t("Changements")}</dt>
          <dd>{lignes.length - 1}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * Fiche article › Historique des prix : le prix d'achat et le prix de vente, chacun avec sa courbe, puis chaque
 * changement (date, origine, nouveaux prix et marge).
 */
export default function ArticleHistoriquePrix({ articleId }: { articleId: string }) {
  const [lignes, setLignes] = useState<PrixHistorique[] | null>(null);

  useEffect(() => {
    getHistoriquePrix(articleId)
      .then(setLignes)
      .catch(() => setLignes([]));
  }, [articleId]);

  if (!lignes) return null;
  if (lignes.length === 0) return <p className="rc-footnote rc-onglet__vide">{t("Aucun prix enregistré pour cet article.")}</p>;

  const recent = [...lignes].reverse();
  return (
    <>
      <div className="rc-prix-cartes">
        <CartePrix titre={t("Prix d'achat HT")} cle="achat" lignes={lignes} valeur={(l) => l.prixAchat} />
        <CartePrix titre={t("Prix de vente TTC")} cle="vente" lignes={lignes} valeur={(l) => l.prixVenteTTC} />
      </div>
      <Section label={t("Tous les changements")} aside={t("{n} changements", { n: lignes.length - 1 })}>
        <Group>
          {recent.map((l, i) => {
            const avant = recent[i + 1];
            const dAchat = avant ? variation(avant.prixAchat, l.prixAchat) : null;
            const dVente = avant ? variation(avant.prixVenteTTC, l.prixVenteTTC) : null;
            return (
              <Row
                key={l.id}
                title={`${dateFr(l.date)} · ${t(SOURCE[l.source])}${l.reference ? ` ${l.reference}` : ""}`}
                meta={l.marge !== null ? t("Marge {n} %", { n: l.marge }) : undefined}
                trailing={
                  <span className="rc-prix-ligne">
                    <span>
                      <small>{t("Achat HT")}</small>
                      <Money value={l.prixAchat} size="sm" />
                      {dAchat && <Tag tone={dAchat.startsWith("+") ? "warning" : "positive"}>{dAchat}</Tag>}
                    </span>
                    <span>
                      <small>{t("Vente TTC")}</small>
                      <Money value={l.prixVenteTTC} size="sm" />
                      {dVente && <Tag tone={dVente.startsWith("+") ? "accent" : "neutral"}>{dVente}</Tag>}
                    </span>
                  </span>
                }
              />
            );
          })}
        </Group>
        <p className="rc-footnote">{t("Chaque prix est en vigueur depuis la date indiquée jusqu'au changement suivant.")}</p>
      </Section>
    </>
  );
}
