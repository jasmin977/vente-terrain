import { useMemo } from "react";
import { IonIcon } from "@ionic/react";
import { cashOutline, walletOutline } from "ionicons/icons";
import type { CreditClient, FactureCredit } from "../types/credit";
import { formatAmount, formatDate, joinMeta } from "../utils/format";
import { texteCorrespond } from "../utils/articleSearch";
import { EmptyState, Money, Row, Section, SkeletonList, Tag } from "../ui";
import { t, tn } from "../i18n";

interface Props {
  credits: CreditClient[];
  loading: boolean;
  query: string;
  onPayer: (facture: FactureCredit, client: CreditClient["client"]) => void;
  onAvance: (clientId: string) => void;
}

/**
 * Bons de livraison à crédit impayés, regroupés par client. Recherche sur le
 * client (nom, code, ville) ou sur le N° du bon : dans ce dernier cas, seuls
 * les bons correspondants du client sont affichés.
 */
export default function CreditsList({ credits, loading, query, onPayer, onAvance }: Props) {
  const groupes = useMemo(() => {
    const q = query.trim();
    if (!q) return credits;
    return credits
      .map((g) => {
        const clientOk = texteCorrespond(`${g.client.nomCommerce} ${g.client.code} ${g.client.ville ?? ""}`, q);
        if (clientOk) return g;
        const factures = g.factures.filter((f) => texteCorrespond(f.numero, q));
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
        message={t("Les bons de livraison à crédit non réglés apparaîtront ici, regroupés par client.")}
      />
    );
  }

  return (
    <>
      <div className="rc-summary">
        <p className="rc-summary__label">{t("Total des crédits clients")}</p>
        <Money value={totalDu} size="xl" tone="danger" />
        <span className="rc-summary__sub">
          {tn(credits.length, "{n} client", "{n} clients")} · {tn(nbFactures, "{n} bon de livraison impayé", "{n} bons de livraison impayés")}
        </span>
      </div>

      {groupes.length === 0 ? (
        <EmptyState icon={walletOutline} title={t("Aucun résultat.")} message={t("Cherchez par nom de client, code, ville ou N° de bon.")} />
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
                      {joinMeta([g.client.code, g.client.ville, tn(g.factures.length, "{n} bon de livraison", "{n} bons de livraison")])}
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
                    aria-label={t("Bon de livraison du {date}, reste {m} TND. Payer", { date: formatDate(f.date), m: formatAmount(f.reste) })}
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
