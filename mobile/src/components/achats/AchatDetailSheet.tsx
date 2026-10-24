import { useEffect, useState } from "react";
import { IonAlert } from "@ionic/react";
import { cashOutline, downloadOutline, printOutline, trashOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { deleteAchat, deleteReglementFournisseur, getAchat } from "../../api/achats";
import type { AchatDetail, ReglementFournisseur } from "../../types/achat";
import { Button, IconButton, Money, Notice, PageNotice, Sheet, Spinner } from "../../ui";
import StatutPaiementTag from "./StatutPaiementTag";
import { nomFournisseur } from "./nomFournisseur";
import { modePaiementLabel } from "../../utils/labels";
import { formatDate } from "../../utils/format";
import { imprimerFactureAchat, telechargerFactureAchatA4 } from "../../utils/bonPdf";
import { t } from "../../i18n";

interface Props {
  achatId: string | null;
  onDismiss: () => void;
  /** Le document a changé (règlement supprimé, document supprimé) : l'écran recharge sa liste. */
  onChange: () => void;
  onRegler: (achat: AchatDetail) => void;
}

/** Détail d'un BL ou d'une facture fournisseur : lignes, totaux, règlements, et actions. */
export default function AchatDetailSheet({ achatId, onDismiss, onChange, onRegler }: Props) {
  const [achat, setAchat] = useState<AchatDetail | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmerSuppression, setConfirmerSuppression] = useState(false);
  const [reglementASupprimer, setReglementASupprimer] = useState<ReglementFournisseur | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [pdf, setPdf] = useState<"telecharger" | "imprimer" | null>(null);

  const charger = (id: string) =>
    getAchat(id)
      .then(setAchat)
      .catch((err) => setErreur(err instanceof ApiError ? err.message : t("Impossible de charger le document")));

  useEffect(() => {
    setAchat(null);
    setErreur(null);
    if (achatId) charger(achatId);
  }, [achatId]);

  const supprimer = async () => {
    if (!achat) return;
    setEnCours(true);
    setErreur(null);
    try {
      await deleteAchat(achat.id);
      onChange();
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de supprimer le document"));
    } finally {
      setEnCours(false);
    }
  };

  const supprimerReglement = async (r: ReglementFournisseur) => {
    setErreur(null);
    try {
      await deleteReglementFournisseur(r.id);
      if (achat) await charger(achat.id);
      onChange();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible de supprimer le règlement"));
    }
  };

  const exporter = async (action: "telecharger" | "imprimer") => {
    if (!achat) return;
    setPdf(action);
    setErreur(null);
    try {
      if (action === "telecharger") await telechargerFactureAchatA4(achat);
      else await imprimerFactureAchat(achat);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : t("Opération interrompue"));
    } finally {
      setPdf(null);
    }
  };

  const facture = achat?.statut === "FACTURE";
  const titre = achat ? (achat.type === "BL" ? t("BL n° {n}", { n: achat.numero }) : achat.type === "ENTREE" ? t("B° Entrée n° {n}", { n: achat.numero }) : t("Facture n° {n}", { n: achat.numero })) : "";

  return (
    <>
      <Sheet
        isOpen={achatId !== null}
        title={titre}
        large
        onDismiss={onDismiss}
        footer={
          achat && (
            <div className="rc-achat__pied rc-achat__pied--actions">
              <Button
                variant="danger"
                icon={trashOutline}
                disabled={enCours || facture || achat.reglements.length > 0}
                onClick={() => setConfirmerSuppression(true)}
              >
                {t("Supprimer")}
              </Button>
              {achat.type === "FACTURE" && (
                <div className="rc-factures__boutons">
                  <Button variant="secondary" icon={downloadOutline} loading={pdf === "telecharger"} disabled={pdf !== null} onClick={() => exporter("telecharger")}>
                    {t("Télécharger")}
                  </Button>
                  <Button variant="secondary" icon={printOutline} loading={pdf === "imprimer"} disabled={pdf !== null} onClick={() => exporter("imprimer")}>
                    {t("Imprimer")}
                  </Button>
                </div>
              )}
              {!facture && achat.reste > 0 && (
                <Button icon={cashOutline} onClick={() => onRegler(achat)}>
                  {t("Régler")}
                </Button>
              )}
            </div>
          )
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}
          {!achat ? (
            !erreur && <Spinner />
          ) : (
            <>
              <div className="rc-achat__entete">
                <div>
                  {/* Un B° Entrée n'a pas de fournisseur : sa note à la place. */}
                  <span className="rc-achat__etiquette">{achat.type === "ENTREE" ? t("Note") : t("Fournisseur")}</span>
                  <strong>{achat.type === "ENTREE" ? achat.notes || "—" : nomFournisseur(achat.fournisseur, achat.fournisseurLibre)}</strong>
                </div>
                <div>
                  <span className="rc-achat__etiquette">{t("Date")}</span>
                  <strong>{formatDate(achat.date)}</strong>
                </div>
                <div>
                  <span className="rc-achat__etiquette">{t("Paiement")}</span>
                  <StatutPaiementTag statut={achat.statut} numeroFacture={achat.facture?.numero} />
                </div>
              </div>

              {facture && achat.facture && (
                <Notice tone="info">{t("Ce BL est regroupé dans la facture n° {n} : il n'est plus modifiable, c'est la facture qui se règle.", { n: achat.facture.numero })}</Notice>
              )}
              {achat.type === "FACTURE" && achat.bons.length > 0 && (
                <Notice tone="info">
                  {t("Facture issue des BL :")} {achat.bons.map((b) => `${b.numero} (${formatDate(b.date)})`).join(", ")}
                </Notice>
              )}

              <div className="rc-tdonnees">
                <table aria-label={t("Lignes")}>
                  <thead>
                    <tr>
                      <th scope="col">{t("Code-barres")}</th>
                      <th scope="col">{t("Désignation")}</th>
                      <th scope="col" style={{ textAlign: "end" }}>{t("Qté")}</th>
                      <th scope="col" style={{ textAlign: "end" }}>{t("P.U. HT")}</th>
                      <th scope="col" style={{ textAlign: "end" }}>{t("TVA")}</th>
                      <th scope="col" style={{ textAlign: "end" }}>{t("Total TTC")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {achat.lignes.map((l) => (
                      <tr key={l.id}>
                        <td>{l.article?.codeBarre ?? "—"}</td>
                        <td className="rc-tdonnees__principale rc-tdonnees__souple">{l.designation}</td>
                        <td style={{ textAlign: "end" }}>{Number(l.quantite)}</td>
                        <td style={{ textAlign: "end" }}>
                          <Money value={Number(l.prixUnitaire)} />
                        </td>
                        <td style={{ textAlign: "end" }}>{Number(l.tauxTva)} %</td>
                        <td style={{ textAlign: "end" }}>
                          <Money value={Number(l.montantTTC)} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rc-transfo__totaux">
                <span>
                  {t("Total HT")} <Money value={Number(achat.montantHT)} size="sm" />
                </span>
                <span>
                  {t("TVA")} <Money value={Number(achat.montantTVA)} size="sm" />
                </span>
                <strong>
                  {t("Total TTC")} <Money value={Number(achat.montantTTC)} size={Number(achat.timbre) > 0 ? "md" : "lg"} />
                </strong>
                {Number(achat.timbre) > 0 && (
                  <>
                    <span>
                      {t("Timbre")} <Money value={Number(achat.timbre)} size="sm" />
                    </span>
                    <strong>
                      {t("Net à payer")} <Money value={Number(achat.montantTTC) + Number(achat.timbre)} size="lg" />
                    </strong>
                  </>
                )}
                {!facture && (
                  <>
                    <span>
                      {t("Payé")} <Money value={achat.paye} size="sm" />
                    </span>
                    <strong>
                      {t("Reste à payer")} <Money value={achat.reste} size="md" tone={achat.reste > 0 ? "warning" : "default"} />
                    </strong>
                  </>
                )}
              </div>

              {achat.reglements.length > 0 && (
                <section className="rc-achat__reglements" aria-label={t("Règlements")}>
                  <h3 className="rc-smart__titre">{t("Règlements")}</h3>
                  <ul>
                    {achat.reglements.map((r) => (
                      <li key={r.id}>
                        <span>{formatDate(r.date)}</span>
                        <span>{modePaiementLabel[r.mode]}</span>
                        <span className="rc-achat__ref">{r.reference ?? ""}</span>
                        <Money value={Number(r.montant)} size="sm" />
                        <IconButton icon={trashOutline} tone="danger" size="sm" label={t("Supprimer le règlement")} onClick={() => setReglementASupprimer(r)} />
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
      </Sheet>

      <IonAlert
        isOpen={confirmerSuppression}
        onDidDismiss={() => setConfirmerSuppression(false)}
        header={t("Supprimer ce document ?")}
        message={achat?.bons.length ? t("Ses BL redeviennent modifiables.") : t("Ses articles sont retirés du stock du dépôt.")}
        buttons={[
          { text: t("Non"), role: "cancel" },
          { text: t("Supprimer"), role: "destructive", handler: supprimer },
        ]}
      />
      <IonAlert
        isOpen={reglementASupprimer !== null}
        onDidDismiss={() => setReglementASupprimer(null)}
        header={t("Supprimer ce règlement ?")}
        message={t("Le montant redevient à payer.")}
        buttons={[
          { text: t("Non"), role: "cancel" },
          { text: t("Supprimer"), role: "destructive", handler: () => {
              if (reglementASupprimer) void supprimerReglement(reglementASupprimer);
            },
          },
        ]}
      />
    </>
  );
}
