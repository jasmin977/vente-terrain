import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { IonContent, IonPage } from "@ionic/react";
import { getClientHistorique } from "../api/clients";
import type { ClientHistorique as ClientHistoriqueType } from "../types/client";
import { ApiError } from "../api/client";
import { formatDate } from "../utils/format";
import { modePaiementLabel, statutLabel } from "../utils/labels";
import ReglementTag from "../components/ReglementTag";
import type { ModePaiement } from "../types/facture";
import { AppHeader, Group, Money, PageNotice, Row, Section, SkeletonList, Tag } from "../ui";
import { t } from "../i18n";

function EmptyLine({ children }: { children: string }) {
  return (
    <Group>
      <Row compact label={children} />
    </Group>
  );
}

export default function ClientHistorique() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ClientHistoriqueType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await getClientHistorique(id!));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Impossible de charger l'historique"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  return (
    <IonPage>
      <AppHeader backHref={`/clients/${id}`} title={t("Historique")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}
        {loading && <SkeletonList rows={5} />}

        {data && (
          <>
            <div className="rc-summary">
              <p className="rc-summary__label">{t("Solde actuel")}</p>
              <Money value={data.solde} size="xl" tone={data.solde > 0 ? "danger" : "default"} />
              <span className="rc-summary__sub">
                {data.solde > 0 ? t("Montant restant dû par le client") : t("Aucun montant dû")}
              </span>
            </div>

            <Section label={t("Factures")} aside={data.factures.length > 0 ? `${data.factures.length}` : undefined}>
              {data.factures.length === 0 ? (
                <EmptyLine>{t("Aucune facture")}</EmptyLine>
              ) : (
                <Group>
                  {data.factures.map((f) => {
                    const annulee = f.statut === "ANNULEE";
                    return (
                      <Row
                        key={f.id}
                        muted={annulee}
                        title={f.numero}
                        meta={formatDate(f.date)}
                        trailing={
                          <>
                            <Money value={f.montantTTC} strike={annulee} />
                            {annulee ? (
                              <Tag tone="danger">{statutLabel.ANNULEE}</Tag>
                            ) : (
                              <ReglementTag typeVente={f.typeVente} reglement={f.reglement} />
                            )}
                          </>
                        }
                      />
                    );
                  })}
                </Group>
              )}
            </Section>

            <Section label={t("Retours")} aside={data.retours.length > 0 ? `${data.retours.length}` : undefined}>
              {data.retours.length === 0 ? (
                <EmptyLine>{t("Aucun retour")}</EmptyLine>
              ) : (
                <Group>
                  {data.retours.map((r) => (
                    <Row key={r.id} title={formatDate(r.date)} meta={r.motif ?? undefined} />
                  ))}
                </Group>
              )}
            </Section>
            <Section label={t("Paiements")} aside={data.paiements.length > 0 ? `${data.paiements.length}` : undefined}>
              {data.paiements.length === 0 ? (
                <EmptyLine>{t("Aucun paiement")}</EmptyLine>
              ) : (
                <Group>
                  {data.paiements.map((p) => (
                    <Row
                      key={p.id}
                      title={formatDate(p.date)}
                      meta={modePaiementLabel[p.mode as ModePaiement] ?? p.mode}
                      trailing={<Money value={p.montant} />}
                    />
                  ))}
                </Group>
              )}
            </Section>

          </>
        )}
      </IonContent>
    </IonPage>
  );
}
