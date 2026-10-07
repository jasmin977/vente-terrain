import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { IonAlert, IonContent, IonPage } from "@ionic/react";
import { closeCircleOutline, printOutline } from "ionicons/icons";
import { annulerFacture, getFacture } from "../api/factures";
import type { Facture } from "../types/facture";
import { ApiError } from "../api/client";
import ArticleImage from "../components/ArticleImage";
import { formatAmount, formatDateTime } from "../utils/format";
import { modePaiementLabel, statutLabel, typeVenteLabel, typeVenteTone } from "../utils/labels";
import { useAuth } from "../auth/AuthContext";
import { printReceipt } from "../utils/receipt";
import { getPrinterIp, setPrinterIp } from "../lib/printerSettings";
import { ActionBar, AppHeader, Button, Group, Money, PageNotice, Row, Section, SkeletonList, Tag } from "../ui";
import ReglementTag from "../components/ReglementTag";
import FactureLocation from "../components/FactureLocation";
import { t } from "../i18n";

export default function FactureDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN";
  const [facture, setFacture] = useState<Facture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [askPrinterIp, setAskPrinterIp] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setFacture(await getFacture(id!));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : t("Facture introuvable"));
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handlePrint = async () => {
    if (!facture) return;
    const ip = await getPrinterIp();
    if (!ip) {
      setAskPrinterIp(true);
      return;
    }
    setPrinting(true);
    setError(null);
    const result = await printReceipt(facture);
    if (!result.ok) setError(result.message ?? t("Impossible de joindre l'imprimante"));
    setPrinting(false);
  };

  const handleSavePrinterIpAndPrint = async (ip: string) => {
    if (!ip.trim() || !facture) return;
    await setPrinterIp(ip.trim());
    setPrinting(true);
    setError(null);
    const result = await printReceipt(facture);
    if (!result.ok) setError(result.message ?? t("Impossible de joindre l'imprimante"));
    setPrinting(false);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await annulerFacture(id!);
      navigate("/factures");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'annulation"));
      setCancelling(false);
    }
  };

  const annulee = facture?.statut === "ANNULEE";

  return (
    <IonPage>
      <AppHeader backHref="/factures" title={facture?.numero ?? t("Facture")} />

      <IonContent>
        {error && <PageNotice>{error}</PageNotice>}

        {loading && <SkeletonList rows={4} thumb />}

        {facture && (
          <>
            <div className="rc-summary">
              <p className="rc-summary__label">{t("Total TTC")}</p>
              <Money value={facture.montantTTC} size="xl" strike={annulee} />
              <span className="rc-summary__sub">{facture.client?.nomCommerce ?? facture.clientId}</span>
              <div className="rc-tags">
                {annulee ? (
                  <Tag tone="danger">{statutLabel.ANNULEE}</Tag>
                ) : (
                  <Tag tone="ink">{statutLabel.VALIDEE}</Tag>
                )}
                {annulee ? (
                  <Tag tone={typeVenteTone[facture.typeVente]} dot>
                    {typeVenteLabel[facture.typeVente]}
                  </Tag>
                ) : (
                  <ReglementTag typeVente={facture.typeVente} reglement={facture.reglement} />
                )}
                {facture.modePaiement && <Tag>{modePaiementLabel[facture.modePaiement]}</Tag>}
              </div>
            </div>

            <Section label={t("Détails")}>
              <Group>
                <Row compact label={t("Client")} trailing={<span className="rc-row__value">{facture.client?.nomCommerce ?? facture.clientId}</span>} />
                {facture.client?.code && (
                  <Row compact label={t("Matricule Fiscale")} trailing={<span className="rc-row__value">{facture.client.code}</span>} />
                )}
                <Row compact label={t("Date")} trailing={<span className="rc-row__value rc-num">{formatDateTime(facture.date)}</span>} />
                {isAdmin && facture.vendeur && (
                  <Row compact label={t("Vendeur")} trailing={<span className="rc-row__value">{`${facture.vendeur.nom} (${facture.vendeur.code})`}</span>} />
                )}
              </Group>
            </Section>

            {/* Position GPS relevée à la validation : contrôle des visites par l'admin. */}
            {isAdmin && <FactureLocation facture={facture} client={facture.client} />}

            <Section label={t("Articles")} aside={`${facture.lignes.length}`}>
              <Group>
                {facture.lignes.map((l) => (
                  <Row
                    key={l.id}
                    thumb
                    leading={<ArticleImage src={l.article.img} alt="" />}
                    title={l.article.designation}
                    meta={
                      <span className="rc-num">
                        {Number(l.quantite)} × {formatAmount(l.prixUnitaire)} · {t("TVA")} {Number(l.tauxTva)} %
                      </span>
                    }
                    trailing={<Money value={l.montantTTC} />}
                  />
                ))}
              </Group>
              <div className="rc-group rc-group--pad">
                <div className="rc-ledger">
                  <div className="rc-ledger__line">
                    <span>{t("Total HT")}</span>
                    <Money value={facture.montantHT} />
                  </div>
                  <div className="rc-ledger__line">
                    <span>{t("TVA")}</span>
                    <Money value={facture.montantTVA} />
                  </div>
                  <div className="rc-ledger__line rc-ledger__line--total">
                    <span>{t("Total TTC")}</span>
                    <Money value={facture.montantTTC} size="lg" strike={annulee} />
                  </div>
                  {/* Vente à crédit : ce qui a déjà été encaissé et ce qui reste dû. */}
                  {!annulee && facture.reglement && (
                    <>
                      <div className="rc-ledger__line">
                        <span>{t("Déjà réglé")}</span>
                        <Money value={facture.reglement.paye} />
                      </div>
                      <div className="rc-ledger__line rc-ledger__line--total">
                        <span>{facture.reglement.reste > 0 ? t("Reste à payer") : t("Crédit entièrement payé")}</span>
                        <Money
                          value={facture.reglement.reste}
                          size="lg"
                          tone={facture.reglement.reste > 0 ? "warning" : "default"}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </Section>

            {isAdmin && facture.statut === "VALIDEE" && (
              <Section>
                <Button
                  variant="danger"
                  block
                  icon={closeCircleOutline}
                  loading={cancelling}
                  onClick={() => setConfirmCancel(true)}
                >
                  {t("Annuler la facture")}
                </Button>
              </Section>
            )}
          </>
        )}

        <IonAlert
          isOpen={confirmCancel}
          onDidDismiss={() => setConfirmCancel(false)}
          header={t("Annuler la facture ?")}
          message={t("Le stock camion sera réintégré. Cette action est définitive.")}
          buttons={[
            { text: t("Non"), role: "cancel" },
            { text: t("Annuler la facture"), role: "destructive", handler: handleCancel },
          ]}
        />

        <IonAlert
          isOpen={askPrinterIp}
          onDidDismiss={() => setAskPrinterIp(false)}
          header={t("Adresse de l'imprimante")}
          message={t("Entrez l'adresse IP Wi-Fi de l'imprimante (visible dans son menu réseau).")}
          inputs={[{ name: "ip", type: "text", placeholder: "192.168.1.100", attributes: { inputmode: "decimal" } }]}
          buttons={[
            { text: t("Annuler"), role: "cancel" },
            {
              text: t("Enregistrer et imprimer"),
              handler: (data) => handleSavePrinterIpAndPrint(data.ip ?? ""),
            },
          ]}
        />
      </IonContent>

      {facture && (
        <ActionBar>
          <Button variant={annulee ? "secondary" : "primary"} size="lg" block icon={printOutline} loading={printing} onClick={handlePrint}>
            {t("Imprimer le ticket")}
          </Button>
        </ActionBar>
      )}
    </IonPage>
  );
}
