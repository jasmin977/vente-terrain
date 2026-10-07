import { useMemo } from "react";
import { IonIcon } from "@ionic/react";
import { cashOutline, walletOutline } from "ionicons/icons";
import type { CreditClient, FactureCredit } from "../types/credit";
import { formatAmount, formatDate, joinMeta } from "../utils/format";
import { texteCorrespond } from "../utils/articleSearch";
import { EmptyState, Money, Row, Section, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

/** Textes de date sur lesquels une recherche peut porter : « 6 oct. 2026 », « 06/10/2026 ». */
function textesDate(iso: string) {
  const d = new Date(iso);
  const jj = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${formatDate(iso)} ${jj}/${mm}/${d.getFullYear()} ${jj}-${mm}-${d.getFullYear()}`;
}

interface Props {
  credits: CreditClient[];
  loading: boolean;
  query: string;
  onPayer: (facture: FactureCredit, client: CreditClient["client"]) => void;
  onAvance: (clientId: string) => void;
}

/**
 * Factures à crédit impayées, regroupées par client. Recherche sur le client
 * (nom, code, ville) ou sur la facture (date, numéro) : dans ce dernier cas,
 * seules les factures correspondantes du client sont affichées.
 */
export default function CreditsList({ credits, loading, query, onPayer, onAvance }: Props) {
  const groupes = useMemo(() => {
    const q = query.trim();
    if (!q) return credits;
    return credits
      .map((g) => {
        const clientOk = texteCorrespond(`${g.client.nomCommerce} ${g.client.code} ${g.client.ville ?? ""}`, q);
        if (clientOk) return g;
        const factures = g.factures.filter((f) => texteCorrespond(`${f.numero} ${textesDate(f.date)}`, q));
        return factures.length ? { ...g, factures } : null;
      })
      .filter((g): g is CreditClient => g !== null);
  }, [credits, query]);

  const totalDu = credits.reduce((s, g) => s + g.totalDu, 0);
  const nbFactures = credits.reduce((s, g) => s + g.factures.length, 0);

  if (loading && credits.length === 0) return <SkeletonList rows={6} />;

  if (credits.length === 0) {
    return (
      <EmptyState
        icon={walletOutline}
        title={t("Aucun crédit en cours.")}
        message={t("Les factures à crédit non réglées apparaîtront ici, regroupées par client.")}
      />
    );
  }

  return (
    <>
      <div className="rc-summary">
        <p className="rc-summary__label">{t("Total des crédits clients")}</p>
        <Money value={totalDu} size="xl" tone="danger" />
        <span className="rc-summary__sub">
          {tn(credits.length, "{n} client", "{n} clients")} · {tn(nbFactures, "{n} facture impayée", "{n} factures impayées")}
        </span>
      </div>

      {groupes.length === 0 ? (
        <EmptyState icon={walletOutline} title={t("Aucun résultat.")} message={t("Cherchez par nom de client ou par date (ex : 06/10/2026, 6 oct.).")} />
      ) : (
        groupes.map((g) => {
          return (
            <Section key={g.client.id}>
              <div className="rc-group rc-credit">
                {/* En-tête client : ouvre l'avance avec ce client présélectionné. */}
                <button type="button" className="rc-credit__head" onClick={() => onAvance(g.client.id)}>
                  <span className="rc-credit__who">
                    <span className="rc-credit__name">{g.client.nomCommerce}</span>
                    <span className="rc-row__meta">
                      {joinMeta([g.client.code, g.client.ville, tn(g.factures.length, "{n} facture", "{n} factures")])}
                    </span>
                  </span>
                  <span className="rc-row__trail">
                    <Money value={g.totalDu} size="lg" />
                    <span className="rc-credit__cta">
                      <IonIcon icon={cashOutline} aria-hidden="true" />
                      {t("Avance")}
                    </span>
                  </span>
                </button>
                {g.factures.map((f) => (
                  <Row
                    key={f.id}
                    onClick={() => onPayer(f, g.client)}
                    title={<span className="rc-num">{formatDate(f.date)}</span>}
                    meta={joinMeta([
                      f.numero,
                      f.vendeur.nom,
                      f.paye > 0 ? t("réglé {paye} sur {total}", { paye: formatAmount(f.paye), total: formatAmount(f.montantTTC) }) : null,
                    ])}
                    trailing={
                      <>
                        <Money value={f.reste} />
                        {f.paye > 0 && <Tag tone="warning">{t("Partiel")}</Tag>}
                      </>
                    }
                    aria-label={t("Facture du {date}, reste {m} TND. Payer", { date: formatDate(f.date), m: formatAmount(f.reste) })}
                  />
                ))}
              </div>
            </Section>
          );
        })
      )}
    </>
  );
}
