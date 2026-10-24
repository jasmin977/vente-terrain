import { IonIcon } from "@ionic/react";
import { arrowForwardOutline, cartOutline, documentTextOutline, swapVerticalOutline, storefrontOutline, walletOutline } from "ionicons/icons";
import { useNavigate } from "react-router-dom";
import type { TableauDeBord } from "../types/tableauDeBord";
import { BarRanking, Money, Tag } from "../ui";
import type { BarRankingItem } from "../ui";
import { Carte, Kpi } from "./DashboardWeb";
import { nomFournisseur } from "./achats/nomFournisseur";
import { modePaiementLabel } from "../utils/labels";
import type { ModePaiement } from "../types/facture";
import { getLocale, t, tn } from "../i18n";

/** Évolution en % : étiquette verte / rouge (pour une dépense, une hausse est mauvaise). */
function Evolution({ valeur, hausseMauvaise = false }: { valeur: number | null; hausseMauvaise?: boolean }) {
  if (valeur === null) return <span className="rc-dash-kpi__note">{t("Rien sur la période précédente.")}</span>;
  const bon = hausseMauvaise ? valeur < 0 : valeur > 0;
  return (
    <>
      <Tag tone={valeur === 0 ? "neutral" : bon ? "positive" : "danger"} dot>
        <bdi>{`${valeur > 0 ? "+" : valeur < 0 ? "−" : ""}${Math.abs(valeur).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} %`}</bdi>
      </Tag>
      <span className="rc-dash-kpi__note">{t("par rapport à la période précédente")}</span>
    </>
  );
}

/**
 * Tableau de bord › achats, charges et trésorerie : ce qu'on a acheté et dépensé sur la période, ce qu'on doit
 * aux fournisseurs, les factures de vente émises, et le solde entre l'argent entré et sorti.
 */
export default function DashboardFinances({ d }: { d: TableauDeBord }) {
  const navigate = useNavigate();
  const { achats, depenses, fournisseurs, facturesVente, tresorerie } = d;

  const aPayer: BarRankingItem[] = fournisseurs.topAPayer.map((f) => ({
    id: f.id,
    label: nomFournisseur(f, null, false),
    value: f.solde,
    display: <Money value={f.solde} size="sm" />,
    sub: tn(f.nbImpayes, "{n} document impayé", "{n} documents impayés"),
  }));
  const categories: BarRankingItem[] = depenses.parCategorie.slice(0, 6).map((c) => ({
    id: c.id,
    label: c.nom,
    value: c.montant,
    display: <Money value={c.montant} size="sm" />,
    sub: `${tn(c.nb, "{n} dépense", "{n} dépenses")} · ${depenses.total > 0 ? Math.round((c.montant / depenses.total) * 100) : 0} %`,
  }));
  const modesRegles = Object.entries(fournisseurs.regleParMode) as [ModePaiement, number][];

  const lien = (texte: string, chemin: string) => (
    <button type="button" className="rc-dash-lien" onClick={() => navigate(chemin)}>
      {texte}
      <IonIcon icon={arrowForwardOutline} aria-hidden="true" />
    </button>
  );

  return (
    <>
      <Kpi
        icone={cartOutline}
        teinte="violet"
        titre={t("Achats de la période")}
        valeur={<Money value={achats.total} size="xl" />}
        pied={<Evolution valeur={achats.evolution} hausseMauvaise />}
      />
      <Kpi
        icone={walletOutline}
        teinte="warning"
        titre={t("Dépenses de la période")}
        valeur={<Money value={depenses.total} size="xl" />}
        pied={<Evolution valeur={depenses.evolution} hausseMauvaise />}
      />
      <Kpi
        icone={storefrontOutline}
        teinte="warning"
        titre={t("Dû aux fournisseurs")}
        valeur={<Money value={fournisseurs.du} size="xl" tone={fournisseurs.du > 0 ? "warning" : "default"} />}
        pied={lien(fournisseurs.nbAPayer > 0 ? tn(fournisseurs.nbAPayer, "{n} fournisseur à payer", "{n} fournisseurs à payer") : t("Voir les règlements"), "/fournisseurs/reglements")}
      />
      <Kpi
        icone={swapVerticalOutline}
        teinte={tresorerie.solde >= 0 ? "positive" : "warning"}
        titre={t("Solde de trésorerie")}
        valeur={<Money value={tresorerie.solde} size="xl" tone={tresorerie.solde < 0 ? "danger" : "default"} />}
        pied={
          <span className="rc-dash-kpi__note">
            {t("Entré")} <strong><Money value={tresorerie.entrees} size="sm" /></strong> · {t("Sorti")} <strong><Money value={tresorerie.sorties} size="sm" /></strong>
            {tresorerie.traitesAVenir && tresorerie.traitesAVenir.nb > 0 && (
              <>
                <br />
                {tn(tresorerie.traitesAVenir.nb, "{n} traite à venir", "{n} traites à venir")} <strong><Money value={tresorerie.traitesAVenir.total} size="sm" /></strong>
              </>
            )}
          </span>
        }
      />

      <Carte titre={t("Factures et achats")} aside={<IonIcon icon={documentTextOutline} aria-hidden="true" />} className="rc-dash-card--tiers">
        <dl className="rc-dash-liste">
          <div>
            <dt>{tn(facturesVente.nb, "{n} facture de vente", "{n} factures de vente")}</dt>
            <dd>
              <Money value={facturesVente.total} />
            </dd>
          </div>
          <div>
            <dt>{tn(facturesVente.blAFacturer.nb, "{n} BL de vente à facturer", "{n} BL de vente à facturer")}</dt>
            <dd>
              <Money value={facturesVente.blAFacturer.total} tone={facturesVente.blAFacturer.nb > 0 ? "warning" : "default"} />
            </dd>
          </div>
          <div>
            <dt>{tn(achats.nbFactures, "{n} facture fournisseur", "{n} factures fournisseurs")}</dt>
            <dd>
              <Money value={achats.totalFactures} />
            </dd>
          </div>
          <div>
            <dt>{tn(achats.nbBL, "{n} BL fournisseur non facturé", "{n} BL fournisseurs non facturés")}</dt>
            <dd>
              <Money value={achats.totalBL} />
            </dd>
          </div>
          <div>
            <dt>{tn(achats.nbEntrees, "{n} B° Entrée", "{n} B° Entrée")}</dt>
            <dd>
              <Money value={achats.totalEntrees} />
            </dd>
          </div>
          <div>
            <dt>{t("Payé aux fournisseurs")}</dt>
            <dd>
              <Money value={fournisseurs.regle} />
              {modesRegles.length > 0 && <small>{modesRegles.map(([m, v]) => `${modePaiementLabel[m]} ${v.toFixed(3)}`).join(" · ")}</small>}
            </dd>
          </div>
        </dl>
        {facturesVente.blAFacturer.nb > 0 && lien(t("Transformer les BL en factures"), "/ventes/transformation")}
      </Carte>

      <Carte titre={t("Fournisseurs à payer")} aside={lien(t("Règlements"), "/fournisseurs/reglements")} className="rc-dash-card--tiers">
        {aPayer.length === 0 ? <p className="rc-footnote">{t("Rien à payer aux fournisseurs.")}</p> : <BarRanking label={t("Fournisseurs à payer")} items={aPayer} />}
      </Carte>

      <Carte titre={t("Dépenses par catégorie")} aside={lien(t("Dépenses"), "/depenses")} className="rc-dash-card--tiers">
        {categories.length === 0 ? <p className="rc-footnote">{t("Aucune dépense sur la période.")}</p> : <BarRanking label={t("Dépenses par catégorie")} items={categories} tone="accent" />}
      </Carte>
    </>
  );
}
