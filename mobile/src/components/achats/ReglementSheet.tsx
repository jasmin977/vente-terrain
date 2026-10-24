import { useEffect, useMemo, useState } from "react";
import { checkmarkOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import {
  createReglementFournisseur,
  imputerAvance,
  listAchats,
  listFournisseurs,
} from "../../api/achats";
import type { Achat, Fournisseur, ReglementFournisseur } from "../../types/achat";
import ImpressionEffetSheet from "../effets/ImpressionEffetSheet";
import type { ModePaiement } from "../../types/facture";
import {
  Button,
  Field,
  Money,
  Notice,
  PageNotice,
  PickerField,
  PickerSheet,
  Segmented,
  Sheet,
} from "../../ui";
import { modePaiementLabel } from "../../utils/labels";
import { nomFournisseur } from "./nomFournisseur";
import { formatDate, toLocalDateString } from "../../utils/format";
import { t } from "../../i18n";

type Choix = "paye" | "avance" | "impaye";
// Règlements fournisseurs : la traite remplace le TPE.
const MODES: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT", "TRAITE"];
const SANS_DOCUMENT = "__compte__";
const nombre = (texte: string) =>
  Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  /** Document à régler (son fournisseur est alors fixé). Sans document : l'admin choisit fournisseur et document. */
  achat?: Pick<
    Achat,
    | "id"
    | "type"
    | "numero"
    | "date"
    | "montantTTC"
    | "reste"
    | "fournisseurId"
    | "fournisseur"
  > & { fournisseurLibre?: string | null } | null;
  /** Juste après la création d'un BL / d'une facture : « Payé », « Avance » ou « Non payé ». */
  apresCreation?: boolean;
  /** Fournisseur proposé quand aucun document n'est donné. */
  fournisseurId?: string;
  onTermine: (enregistre: boolean) => void;
}

/** Saisie d'un règlement fournisseur : paiement total, avance, ou rien (document laissé non payé). */
export default function ReglementSheet({
  isOpen,
  onDismiss,
  achat,
  apresCreation,
  fournisseurId: fournisseurPropose,
  onTermine,
}: Props) {
  const aujourdhui = toLocalDateString(new Date());
  const [choix, setChoix] = useState<Choix>("paye");
  const [montantTxt, setMontantTxt] = useState("");
  const [mode, setMode] = useState<ModePaiement>("ESPECES");
  const [date, setDate] = useState(aujourdhui);
  const [reference, setReference] = useState("");
  // Traite : échéance, proposée un mois après la date du document réglé (ou du règlement).
  const [echeance, setEcheance] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  // Chèque ou traite : dernière étape, l'impression sur le papier de la banque (tout est déjà rempli).
  const [aImprimer, setAImprimer] = useState<{ reglement: ReglementFournisseur; ordre: string } | null>(null);

  // Règlement libre : fournisseur, puis l'un de ses documents non réglés (ou une avance sur compte).
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [fournisseurId, setFournisseurId] = useState<string | undefined>(
    undefined,
  );
  const [documents, setDocuments] = useState<Achat[]>([]);
  const [documentId, setDocumentId] = useState<string>(SANS_DOCUMENT);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [pickerDocument, setPickerDocument] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Achat « Divers » : en général payé sur place.
    setChoix(apresCreation && !achat?.fournisseur?.divers ? "impaye" : "paye");
    setMontantTxt("");
    setMode("ESPECES");
    setDate(aujourdhui);
    setReference("");
    setEcheance("");
    setErreur(null);
    setDocumentId(SANS_DOCUMENT);
    setFournisseurId(achat?.fournisseurId ?? fournisseurPropose);
    // Aussi avec un document donné : l'avance disponible du fournisseur peut le régler.
    listFournisseurs()
      .then(setFournisseurs)
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Tous les BL et factures non réglés : on peut choisir le document directement (son fournisseur suit),
  // ou d'abord le fournisseur pour ne voir que ses documents.
  useEffect(() => {
    if (!isOpen || achat) {
      setDocuments([]);
      return;
    }
    listAchats({ statut: "impaye" })
      .then((l) => setDocuments(l.filter((d) => !d.factureId)))
      .catch(() => setDocuments([]));
  }, [isOpen, achat]);
  const documentsProposes = fournisseurId
    ? documents.filter((d) => d.fournisseurId === fournisseurId)
    : documents;

  const document = achat ?? documents.find((d) => d.id === documentId) ?? null;
  const reste = document ? Number(document.reste) : 0;
  const montant = choix === "paye" && document ? reste : nombre(montantTxt);
  const fournisseur = fournisseurs.find((f) => f.id === fournisseurId);
  // Avance versée sans document : elle règle ce document en premier (on ne repaie pas ce qui est déjà donné).
  const avanceDispo = fournisseur?.avances ?? 0;
  const avanceUtilisable = document ? Math.min(avanceDispo, reste) : 0;
  const utiliserAvance = async () => {
    if (!fournisseurId || !document) return;
    setEnCours(true);
    setErreur(null);
    try {
      await imputerAvance(fournisseurId, [{ achatId: document.id, montant: Math.round(avanceUtilisable * 1000) / 1000 }]);
      onTermine(true);
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'imputer l'avance"));
    } finally {
      setEnCours(false);
    }
  };
  const echeanceProposee = (() => {
    const base = document ? new Date(document.date) : new Date(`${date}T12:00:00`);
    base.setMonth(base.getMonth() + 1);
    return toLocalDateString(base);
  })();

  const erreurMontant = useMemo(() => {
    if (choix === "impaye" || (choix === "paye" && document)) return null;
    if (montant <= 0) return null;
    if (document && montant > reste + 0.0005)
      return t("Le montant dépasse le reste à payer.");
    return null;
  }, [choix, document, montant, reste]);

  // Une traite se retrouve par son numéro : il est obligatoire.
  const pret =
    choix === "impaye" ||
    (Boolean(fournisseurId) &&
      montant > 0 &&
      !erreurMontant &&
      Boolean(date) &&
      (mode !== "TRAITE" || reference.trim() !== ""));

  const enregistrer = async () => {
    if (choix === "impaye") {
      onTermine(false);
      onDismiss();
      return;
    }
    if (!fournisseurId) return;
    setEnCours(true);
    setErreur(null);
    try {
      const cree = await createReglementFournisseur({
        fournisseurId,
        achatId: document?.id ?? null,
        montant,
        mode,
        date,
        reference: reference.trim() || undefined,
        echeance: mode === "TRAITE" ? echeance || echeanceProposee : undefined,
      });
      if (mode === "CHEQUE" || mode === "TRAITE") {
        const f = achat?.fournisseur ?? fournisseur ?? document?.fournisseur;
        const libre = achat?.fournisseurLibre ?? document?.fournisseurLibre;
        // « Divers » : le bénéficiaire est la précision du document (chez qui), à défaut à saisir.
        setAImprimer({ reglement: cree, ordre: f?.divers ? libre ?? "" : f?.nom ?? "" });
        return;
      }
      onTermine(true);
      onDismiss();
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.message
          : t("Impossible d'enregistrer le règlement"),
      );
    } finally {
      setEnCours(false);
    }
  };

  const options: { value: Choix; label: string }[] = [
    { value: "paye", label: t("Payé") },
    { value: "avance", label: t("Avance") },
    ...(apresCreation
      ? [{ value: "impaye" as const, label: t("Non payé") }]
      : []),
  ];

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={
          apresCreation
            ? t("Règlement du document")
            : t("Règlement fournisseur")
        }
        height="auto"
        onDismiss={onDismiss}
        footer={
          <div className="rc-achat__pied">
            <Button
              size="lg"
              icon={checkmarkOutline}
              loading={enCours}
              disabled={!pret}
              onClick={enregistrer}
            >
              {choix === "impaye"
                ? t("Laisser non payé")
                : mode === "CHEQUE"
                ? t("Enregistrer et imprimer le chèque")
                : mode === "TRAITE"
                ? t("Enregistrer et imprimer la traite")
                : t("Enregistrer le règlement")}
            </Button>
          </div>
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}

          {achat ? (
            <div className="rc-achat__resume">
              <span>
                {achat.type === "BL"
                  ? t("BL n° {n}", { n: achat.numero })
                  : t("Facture n° {n}", { n: achat.numero })}{" "}
                · {formatDate(achat.date)}
              </span>
              <strong>{nomFournisseur(achat.fournisseur, achat.fournisseurLibre)}</strong>
              <span>
                {t("Reste à payer")} <Money value={reste} size="md" />
              </span>
            </div>
          ) : (
            <div className="rc-achat__ligne2">
              <PickerField
                label={t("Fournisseur")}
                required
                value={
                  fournisseur
                    ? nomFournisseur(fournisseur)
                    : undefined
                }
                placeholder={t("Choisir un fournisseur")}
                onOpen={() => setPickerFournisseur(true)}
              />
              <PickerField
                label={t("Document")}
                value={
                  documentId === SANS_DOCUMENT
                    ? t("Avance sur compte (sans document)")
                    : document
                    ? `${document.type === "BL" ? "BL" : document.type === "ENTREE" ? t("B° Entrée") : t("Facture")} ${
                        document.numero
                      } · ${formatDate(document.date)}`
                    : undefined
                }
                placeholder={t("Choisir")}
                onOpen={() => setPickerDocument(true)}
              />
            </div>
          )}

          {document && avanceUtilisable > 0.0005 && choix !== "impaye" && (
            <div className="rc-avance">
              <span>
                <strong>
                  <Money value={avanceDispo} size="md" />
                </strong>{" "}
                {avanceUtilisable < reste - 0.0005
                  ? t("d'avance disponible chez ce fournisseur : elle règle une partie de ce document.")
                  : t("d'avance disponible chez ce fournisseur : elle suffit à régler ce document.")}
              </span>
              <Button variant="secondary" loading={enCours} onClick={utiliserAvance}>
                {t("Utiliser l'avance ({m} TND)", { m: avanceUtilisable.toFixed(3) })}
              </Button>
            </div>
          )}

          {(achat || document) && (
            <Segmented
              label={t("Règlement")}
              value={choix}
              onChange={setChoix}
              options={options}
            />
          )}

          {choix !== "impaye" && (
            <>
              {choix === "paye" && document ? (
                <Notice tone="info">
                  {t("Le document est réglé en totalité :")}{" "}
                  <Money value={reste} size="sm" />
                </Notice>
              ) : (
                <Field
                  label={
                    document
                      ? t("Montant de l'avance (TND)")
                      : t("Montant (TND)")
                  }
                  inputMode="decimal"
                  value={montantTxt}
                  placeholder="0.000"
                  onChange={setMontantTxt}
                  error={erreurMontant}
                  required
                />
              )}
              <Segmented
                label={t("Mode de paiement")}
                variant="tiles"
                wrap
                value={mode}
                onChange={setMode}
                options={MODES.map((m) => ({
                  value: m,
                  label: modePaiementLabel[m],
                }))}
              />
              <div className="rc-achat__ligne2">
                <Field
                  label={t("Date du règlement")}
                  type="date"
                  value={date}
                  max={aujourdhui}
                  onChange={(v) => setDate(v || aujourdhui)}
                  required
                />
                <Field
                  label={
                    mode === "TRAITE"
                      ? t("N° de la traite")
                      : mode === "CHEQUE"
                      ? t("N° du chèque")
                      : t("Référence")
                  }
                  value={reference}
                  onChange={setReference}
                  required={mode === "TRAITE"}
                  placeholder={
                    mode === "CHEQUE"
                      ? t("N° de chèque")
                      : mode === "VIREMENT"
                      ? t("N° de virement")
                      : mode === "TRAITE"
                      ? t("N° de la traite")
                      : t("Facultatif")
                  }
                />
              </div>
              {mode === "TRAITE" && (
                <Field
                  label={t("Échéance de la traite")}
                  type="date"
                  value={echeance || echeanceProposee}
                  onChange={(v) => setEcheance(v || echeanceProposee)}
                  hint={t("Proposée un mois après la date du document. Elle s'affiche dans le tableau de bord quand elle approche.")}
                  required
                />
              )}
            </>
          )}
        </div>
      </Sheet>

      <ImpressionEffetSheet
        isOpen={aImprimer !== null}
        type={aImprimer?.reglement.mode === "TRAITE" ? "TRAITE" : "CHEQUE"}
        reglementId={aImprimer?.reglement.id}
        initial={
          aImprimer
            ? {
                numero: aImprimer.reglement.reference ?? "",
                montant: Number(aImprimer.reglement.montant),
                ordre: aImprimer.ordre,
                echeance: aImprimer.reglement.echeance ? toLocalDateString(new Date(aImprimer.reglement.echeance)) : "",
              }
            : undefined
        }
        onDismiss={() => setAImprimer(null)}
        onTermine={() => {
          setAImprimer(null);
          onTermine(true);
          onDismiss();
        }}
      />

      {!achat && (
        <>
          <PickerSheet
            isOpen={pickerFournisseur}
            title={t("Fournisseur")}
            value={fournisseurId}
            onDismiss={() => setPickerFournisseur(false)}
            onSelect={(v) => {
              setFournisseurId(v);
              setDocumentId(SANS_DOCUMENT);
              setPickerFournisseur(false);
            }}
            options={fournisseurs.map((f) => ({
              value: f.id,
              label: nomFournisseur(f),
              meta:
                f.solde > 0
                  ? `${t("Dû")} ${f.solde.toFixed(3)} TND`
                  : undefined,
              keywords: `${f.ref} ${f.matriculeFiscal ?? ""}`,
            }))}
          />
          <PickerSheet
            isOpen={pickerDocument}
            title={t("Document")}
            value={documentId}
            onDismiss={() => setPickerDocument(false)}
            onSelect={(v) => {
              setDocumentId(v);
              const choisi = documents.find((d) => d.id === v);
              if (choisi) setFournisseurId(choisi.fournisseurId);
              setChoix("paye");
              setPickerDocument(false);
            }}
            emptyLabel={t("Aucun BL ni facture à régler.")}
            options={[
              {
                value: SANS_DOCUMENT,
                label: t("Avance sur compte (sans document)"),
              },
              ...documentsProposes.map((d) => ({
                value: d.id,
                label: `${d.type === "BL" ? "BL" : d.type === "ENTREE" ? t("B° Entrée") : t("Facture")} ${
                  d.numero
                } · ${nomFournisseur(d.fournisseur, d.fournisseurLibre, false)}`,
                meta: `${formatDate(d.date)} · ${t("reste")} ${Number(
                  d.reste,
                ).toFixed(3)} TND`,
                keywords: `${d.numero} ${d.fournisseur.nom} ${d.fournisseur.ref} ${d.fournisseurLibre ?? ""}`,
              })),
            ]}
          />
        </>
      )}
    </>
  );
}
