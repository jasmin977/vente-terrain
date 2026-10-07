import { useEffect, useMemo, useState } from "react";
import { IonAlert, useIonToast } from "@ionic/react";
import { trashOutline } from "ionicons/icons";
import type { ModePaiement } from "../types/facture";
import type { CreditClient, EncaissementInput, FactureCredit, SituationCreditClient } from "../types/credit";
import { ajouterAvance, annulerPaiement, getCreditClient, payerFacture } from "../api/credits";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { formatAmount, formatDate, toLocalDateString, joinMeta } from "../utils/format";
import { modePaiementLabel } from "../utils/labels";
import {
  Button,
  Field,
  Group,
  IconButton,
  Money,
  Notice,
  PickerField,
  PickerSheet,
  Row,
  Section,
  Segmented,
  Sheet,
} from "../ui";
import { t, tn } from "../i18n";

// TPE n'est plus proposé (non utilisé).
const modes: ModePaiement[] = ["ESPECES", "CHEQUE", "VIREMENT"];
const arrondi = (n: number) => Math.round(n * 1000) / 1000;

/** Mode, date et référence d'un encaissement — communs au paiement d'une facture et à l'avance. */
function useEncaissement() {
  const [mode, setMode] = useState<ModePaiement>("ESPECES");
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [reference, setReference] = useState("");
  const reset = () => {
    setMode("ESPECES");
    setDate(toLocalDateString(new Date()));
    setReference("");
  };
  const today = toLocalDateString(new Date());
  // Aujourd'hui : on laisse le serveur horodater (heure réelle) ; un autre jour : midi local.
  const input = (): EncaissementInput => ({
    mode,
    reference: reference.trim() || undefined,
    date: date && date !== today ? new Date(`${date}T12:00:00`).toISOString() : undefined,
  });
  const fields = (
    <>
      <div className="rc-field">
        <span className="rc-field__label">{t("Mode de paiement")}</span>
        <Segmented
          label={t("Mode de paiement")}
          variant="tiles"
          wrap
          value={mode}
          onChange={setMode}
          options={modes.map((m) => ({ value: m, label: modePaiementLabel[m] }))}
        />
      </div>
      <div className="rc-fields__row">
        <Field
          label={t("Date du paiement")}
          type="date"
          value={date}
          max={today}
          onChange={(v) => setDate(v || today)}
          required
        />
        <Field
          label={t("Référence")}
          value={reference}
          onChange={setReference}
          placeholder={mode === "CHEQUE" ? t("N° de chèque") : t("Facultatif")}
        />
      </div>
    </>
  );
  return { fields, input, reset, date, today };
}

function useToast() {
  const [toast] = useIonToast();
  return (message: string) => toast({ message, duration: 2200, position: "top", cssClass: "rc-toast" });
}

/* ------------------------------------------------------------------ Payer une facture */

export function PayerFactureSheet({
  facture,
  client,
  onDismiss,
  onDone,
}: {
  facture: FactureCredit | null;
  client: CreditClient["client"] | null;
  onDismiss: () => void;
  onDone: () => void;
}) {
  const enc = useEncaissement();
  const notify = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const payer = async () => {
    if (!facture) return;
    setSaving(true);
    setError(null);
    try {
      await payerFacture(facture.id, enc.input());
      notify(`Facture ${facture.numero} payée`);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'encaissement"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      isOpen={facture !== null}
      title={t("Payer la facture")}
      height="auto"
      onDismiss={onDismiss}
      onWillPresent={() => {
        enc.reset();
        setError(null);
      }}
    >
      {facture && (
        <>
          <Section>
            <Group>
              <Row compact label={t("Client")} trailing={<span className="rc-row__value">{client?.nomCommerce}</span>} />
              <Row compact label={t("Facture")} trailing={<span className="rc-row__value">{facture.numero}</span>} />
              <Row compact label={t("Date")} trailing={<span className="rc-row__value rc-num">{formatDate(facture.date)}</span>} />
              <Row compact label={t("Montant TTC")} trailing={<Money value={facture.montantTTC} />} />
              {facture.paye > 0 && <Row compact label={t("Déjà réglé")} trailing={<Money value={facture.paye} />} />}
              <Row compact label={t("Reste à payer")} trailing={<Money value={facture.reste} size="lg" />} />
            </Group>
          </Section>
          <Section>
            <div className="rc-fields">
              {enc.fields}
              {error && <Notice>{error}</Notice>}
              <Button size="lg" block loading={saving} onClick={payer}>
                {t("Encaisser {m} TND", { m: formatAmount(facture.reste) })}
              </Button>
            </div>
          </Section>
        </>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ Ajouter une avance */

export function AvanceSheet({
  isOpen,
  credits,
  clientId: clientInitial,
  onDismiss,
  onDone,
}: {
  isOpen: boolean;
  credits: CreditClient[];
  /** Client présélectionné (tap sur le nom dans la liste). */
  clientId?: string;
  onDismiss: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const enc = useEncaissement();
  const notify = useToast();
  const [clientId, setClientId] = useState<string | undefined>(clientInitial);
  const [montant, setMontant] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [situation, setSituation] = useState<SituationCreditClient | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aAnnuler, setAAnnuler] = useState<string | null>(null);

  const charger = (id: string | undefined) => {
    setSituation(null);
    if (!id) return;
    getCreditClient(id)
      .then(setSituation)
      .catch(() => setSituation(null));
  };

  useEffect(() => {
    if (isOpen) charger(clientId);
  }, [isOpen, clientId]);

  const credit = credits.find((c) => c.client.id === clientId);
  const du = situation?.totalDu ?? credit?.totalDu ?? 0;
  const valeur = Number(montant.replace(",", "."));
  const valide = clientId && valeur > 0 && valeur <= du + 0.0005;
  const apres = arrondi(du - (valeur > 0 ? valeur : 0));
  const options = useMemo(
    () =>
      credits.map((c) => ({
        value: c.client.id,
        label: c.client.nomCommerce,
        meta: joinMeta([c.client.code, c.client.ville]),
        keywords: `${c.client.code} ${c.client.ville ?? ""}`,
        trailing: <Money value={c.totalDu} size="sm" />,
      })),
    [credits]
  );

  const enregistrer = async () => {
    if (!valide || !clientId) return;
    setSaving(true);
    setError(null);
    try {
      await ajouterAvance(clientId, arrondi(valeur), enc.input());
      notify(t("Avance de {m} TND enregistrée", { m: formatAmount(valeur) }));
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'enregistrement"));
    } finally {
      setSaving(false);
    }
  };

  const annuler = async () => {
    if (!aAnnuler) return;
    try {
      await annulerPaiement(aAnnuler);
      notify(t("Paiement annulé"));
      charger(clientId);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Échec de l'annulation"));
    }
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={t("Ajouter une avance")}
        onDismiss={onDismiss}
        onWillPresent={() => {
          enc.reset();
          setMontant("");
          setError(null);
          setClientId(clientInitial);
        }}
      >
        <Section>
          <div className="rc-fields">
            <PickerField
              label={t("Client")}
              required
              placeholder={t("Choisir un client")}
              value={credit?.client.nomCommerce ?? situation?.client.nomCommerce}
              meta={credit ? `${t("Doit {m} TND", { m: formatAmount(credit.totalDu) })} · ${tn(credit.factures.length, "{n} facture", "{n} factures")}` : undefined}
              onOpen={() => setPickerOpen(true)}
            />

            {clientId && (
              <>
                <div className="rc-bulk">
                  <Field
                    label={t("Montant de l'avance")}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={montant}
                    onChange={setMontant}
                    suffix="TND"
                    placeholder="0.000"
                    error={valeur > du + 0.0005 ? t("Le client ne doit que {m} TND", { m: formatAmount(du) }) : undefined}
                    hint={valeur > 0 && valeur <= du + 0.0005 ? t("Reste dû après l'avance : {m} TND", { m: formatAmount(apres) }) : t("Total dû : {m} TND", { m: formatAmount(du) })}
                  />
                  <Button variant="secondary" size="lg" onClick={() => setMontant(du.toFixed(3))} style={{ alignSelf: "start", marginTop: 26 }}>
                    {t("Tout")}
                  </Button>
                </div>
                {enc.fields}
                <p className="rc-footnote">{t("L'avance est imputée aux factures les plus anciennes en premier.")}</p>
              </>
            )}

            {error && <Notice>{error}</Notice>}
            <Button size="lg" block disabled={!valide} loading={saving} onClick={enregistrer}>
              {t("Enregistrer l'avance")}
            </Button>
          </div>
        </Section>

        {situation && situation.paiements.length > 0 && (
          <Section label={t("Derniers encaissements")}>
            <Group>
              {situation.paiements.slice(0, 8).map((p) => (
                <Row
                  key={p.id}
                  compact
                  title={<span className="rc-num">{formatDate(p.date)}</span>}
                  meta={joinMeta([p.facture ? t("Facture {numero}", { numero: p.facture.numero }) : t("Avance"), modePaiementLabel[p.mode], p.reference, p.vendeur.nom])}
                  trailing={
                    <span className="rc-inline">
                      <Money value={p.montant} />
                      {user?.role === "ADMIN" && (
                        <IconButton
                          icon={trashOutline}
                          label={t("Annuler le paiement du {date}", { date: formatDate(p.date) })}
                          size="sm"
                          tone="danger"
                          onClick={() => setAAnnuler(p.id)}
                        />
                      )}
                    </span>
                  }
                />
              ))}
            </Group>
          </Section>
        )}
      </Sheet>

      <PickerSheet
        isOpen={pickerOpen}
        title={t("Client")}
        searchPlaceholder={t("Commerce, code, ville…")}
        emptyLabel={t("Aucun client avec un crédit.")}
        value={clientId}
        onDismiss={() => setPickerOpen(false)}
        onSelect={(id) => {
          setClientId(id);
          setPickerOpen(false);
        }}
        options={options}
      />

      <IonAlert
        isOpen={aAnnuler !== null}
        onDidDismiss={() => setAAnnuler(null)}
        header={t("Annuler ce paiement ?")}
        message={t("Le montant redevient dû par le client. Utilisez-le pour corriger une saisie erronée.")}
        buttons={[
          { text: t("Garder"), role: "cancel" },
          { text: t("Annuler le paiement"), role: "destructive", handler: annuler },
        ]}
      />
    </>
  );
}
