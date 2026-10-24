import { useEffect, useState } from "react";
import {
  addOutline,
  checkmarkOutline,
  gridOutline,
  printOutline,
  storefrontOutline,
} from "ionicons/icons";
import { ApiError } from "../../api/client";
import { listComptesBancaires } from "../../api/comptesBancaires";
import {
  enregistrerImpressionReglement,
  listFournisseurs,
} from "../../api/achats";
import type { Fournisseur } from "../../types/achat";
import type {
  CompteBancaire,
  TypeEffet,
  ValeursEffet,
} from "../../types/effet";
import {
  Button,
  Field,
  Notice,
  PageNotice,
  PickerField,
  PickerSheet,
  Segmented,
  Sheet,
} from "../../ui";
import { useSociete } from "../../societe/SocieteContext";
import {
  gabaritDe,
  imprimerPage,
  pageEffet,
  ribLisible,
  textesEffet,
} from "../../utils/effets";
import { montantEffetEnLettres } from "../../utils/montantEnLettres";
import { toLocalDateString } from "../../utils/format";
import ApercuEffet from "./ApercuEffet";
import CompteBancaireSheet from "./CompteBancaireSheet";
import { t } from "../../i18n";

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  type: TypeEffet;
  /** Impression libre : chèque ou traite au choix. */
  typeModifiable?: boolean;
  /** Valeurs connues (règlement : montant, fournisseur, échéance, numéro). */
  initial?: Partial<ValeursEffet>;
  /** Règlement fournisseur imprimé : son numéro, son compte et les valeurs imprimées y sont gardés. */
  reglementId?: string;
  compteBancaireId?: string | null;
  /** Après la dernière étape (impression ou « Plus tard »). */
  onTermine?: (imprime: boolean) => void;
}

const nombre = (texte: string) =>
  Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

/**
 * Dernière étape d'un règlement par chèque ou traite : tout est déjà rempli (montant, bénéficiaire, échéance,
 * compte de la société) ; on met le papier vierge dans l'imprimante et l'app n'imprime que le texte.
 */
export default function ImpressionEffetSheet({
  isOpen,
  onDismiss,
  type: typeInitial,
  typeModifiable,
  initial,
  reglementId,
  compteBancaireId,
  onTermine,
}: Props) {
  const { societe } = useSociete();
  const aujourdhui = toLocalDateString(new Date());
  const [type, setType] = useState<TypeEffet>(typeInitial);
  const [comptes, setComptes] = useState<CompteBancaire[] | null>(null);
  const [compteId, setCompteId] = useState<string | undefined>(undefined);
  const [v, setV] = useState<ValeursEffet>(() => valeursVides(aujourdhui));
  const [montantTxt, setMontantTxt] = useState("");
  const [pickerCompte, setPickerCompte] = useState(false);
  const [nouveauCompte, setNouveauCompte] = useState(false);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [pickerFournisseur, setPickerFournisseur] = useState(false);
  const [imprime, setImprime] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setType(typeInitial);
    setImprime(false);
    setErreur(null);
    const depart = { ...valeursVides(aujourdhui), ...initial };
    setV(depart);
    setMontantTxt(depart.montant ? depart.montant.toFixed(3) : "");
    if (typeModifiable)
      listFournisseurs()
        .then((l) => setFournisseurs(l.filter((f) => !f.divers)))
        .catch(() => setFournisseurs([]));
    listComptesBancaires()
      .then((l) => {
        setComptes(l);
        const choisi =
          l.find((c) => c.id === compteBancaireId) ??
          l.find((c) => c.parDefaut) ??
          l[0];
        setCompteId(choisi?.id);
        if (choisi) remplirDepuisCompte(choisi, depart);
      })
      .catch(() => setComptes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const compte = comptes?.find((c) => c.id === compteId) ?? null;
  // Le payeur et le lieu suivent le compte choisi, sauf s'ils ont été tapés.
  function remplirDepuisCompte(c: CompteBancaire, base: ValeursEffet = v) {
    setV({
      ...base,
      payeur: initial?.payeur || c.titulaire || societe?.nom || "",
      lieu: initial?.lieu || c.ville || base.lieu,
    });
  }

  const gabarit = gabaritDe(type, compte?.gabarits?.[type]);
  const valeurs = { ...v, montant: nombre(montantTxt) };
  const textes = textesEffet(type, gabarit, valeurs, compte);
  const maj = <K extends keyof ValeursEffet>(k: K, val: ValeursEffet[K]) =>
    setV((x) => ({ ...x, [k]: val }));

  const manque = !compte
    ? t("Choisissez le compte bancaire")
    : !(valeurs.montant > 0)
    ? t("Saisissez le montant")
    : !v.ordre.trim()
    ? t("Saisissez le bénéficiaire")
    : type === "TRAITE" && !v.echeance
    ? t("Saisissez l'échéance")
    : null;

  const imprimer = async (test: boolean) => {
    setErreur(null);
    await imprimerPage(
      pageEffet(type, gabarit, textes, {
        test,
        origine: window.location.origin,
      }),
    );
    if (test || !reglementId) {
      if (!test) setImprime(true);
      return;
    }
    try {
      await enregistrerImpressionReglement(reglementId, {
        reference: v.numero.trim() || null,
        compteBancaireId: compte?.id ?? null,
        echeance: type === "TRAITE" ? v.echeance : null,
        impression: { ...textes, numero: v.numero },
      });
      setImprime(true);
    } catch (err) {
      setErreur(
        err instanceof ApiError
          ? err.message
          : t("Impression faite, mais le règlement n'a pas été mis à jour."),
      );
    }
  };

  const terminer = () => {
    onTermine?.(imprime);
    onDismiss();
  };

  return (
    <>
      <Sheet
        isOpen={isOpen}
        title={
          type === "TRAITE"
            ? t("Impression de la traite")
            : t("Impression du chèque")
        }
        large
        onDismiss={terminer}
        footer={
          <div className="rc-achat__pied rc-achat__pied--actions">
            <Button
              variant="ghost"
              icon={gridOutline}
              disabled={!compte}
              onClick={() => imprimer(true)}
            >
              {t("Test sur papier blanc")}
            </Button>
            {imprime ? (
              <Button size="lg" icon={checkmarkOutline} onClick={terminer}>
                {t("Terminé")}
              </Button>
            ) : (
              <>
                {reglementId && (
                  <Button variant="secondary" onClick={terminer}>
                    {t("Plus tard")}
                  </Button>
                )}
                <Button
                  size="lg"
                  icon={printOutline}
                  disabled={Boolean(manque)}
                  onClick={() => imprimer(false)}
                >
                  {manque ??
                    (type === "TRAITE"
                      ? t("Imprimer la traite")
                      : t("Imprimer le chèque"))}
                </Button>
              </>
            )}
          </div>
        }
      >
        <div className="rc-achat__form">
          {erreur && <PageNotice>{erreur}</PageNotice>}
          {imprime && (
            <Notice tone="info">
              {reglementId
                ? t(
                    "Imprimé : le règlement garde le numéro et les valeurs imprimées. Vous pouvez réimprimer depuis la liste des règlements.",
                  )
                : t("Envoyé à l'imprimante.")}
            </Notice>
          )}
          {typeModifiable && (
            <Segmented
              label={t("Effet")}
              value={type}
              onChange={setType}
              options={[
                { value: "TRAITE", label: t("Traite") },
                { value: "CHEQUE", label: t("Chèque") },
              ]}
            />
          )}

          {comptes && comptes.length === 0 ? (
            <Notice tone="warning">
              {t(
                "Ajoutez d'abord le compte bancaire de la société : sa banque et son RIB sont imprimés sur le papier.",
              )}{" "}
              <Button
                variant="secondary"
                icon={addOutline}
                onClick={() => setNouveauCompte(true)}
              >
                {t("Ajouter un compte bancaire")}
              </Button>
            </Notice>
          ) : (
            <PickerField
              label={t("Compte tiré")}
              value={
                compte
                  ? `${compte.banque}${
                      compte.agence ? ` ${compte.agence}` : ""
                    } · ${ribLisible(compte.rib)}`
                  : undefined
              }
              placeholder={t("Choisir le compte")}
              onOpen={() => setPickerCompte(true)}
            />
          )}

          <ApercuEffet type={type} gabarit={gabarit} textes={textes} />
          <p className="rc-footnote">
            {t(
              "Papier {l} × {h} mm. Mettez le papier vierge dans le bac manuel ; à l'impression, choisissez « Taille réelle » (100 %) et aucune marge.",
              {
                l: gabarit.largeur,
                h: gabarit.hauteur,
              },
            )}
          </p>

          <div className="rc-achat__ligne2">
            <Field
              label={
                type === "TRAITE" ? t("N° de la traite") : t("N° du chèque")
              }
              value={v.numero}
              onChange={(x) => maj("numero", x)}
              hint={t("Le numéro pré-imprimé sur le papier.")}
            />
            <Field
              label={t("Montant (TND)")}
              inputMode="decimal"
              value={montantTxt}
              onChange={setMontantTxt}
              placeholder="0.000"
              required
            />
          </div>
          {valeurs.montant > 0 && (
            <p className="rc-effet__lettres">
              {montantEffetEnLettres(valeurs.montant)}
            </p>
          )}
          <Field
            label={t("À l'ordre de")}
            value={v.ordre}
            onChange={(x) => maj("ordre", x)}
            placeholder={
              typeModifiable
                ? t("Choisir un fournisseur ou taper un nom")
                : undefined
            }
            suffix={
              typeModifiable ? (
                <Button
                  variant="ghost"
                  icon={storefrontOutline}
                  onClick={() => setPickerFournisseur(true)}
                >
                  {t("Fournisseur")}
                </Button>
              ) : undefined
            }
            required
          />
          <div className="rc-achat__ligne2">
            <Field
              label={t("Lieu de création")}
              value={v.lieu}
              onChange={(x) => maj("lieu", x)}
            />
            <Field
              label={t("Date de création")}
              type="date"
              value={v.dateCreation}
              onChange={(x) => maj("dateCreation", x || aujourdhui)}
            />
          </div>
          {type === "TRAITE" && (
            <>
              <div className="rc-achat__ligne2">
                <Field
                  label={t("Échéance")}
                  type="date"
                  value={v.echeance}
                  onChange={(x) => maj("echeance", x)}
                  required
                />
                <Field
                  label={t("Tiré (payeur)")}
                  value={v.payeur}
                  onChange={(x) => maj("payeur", x)}
                />
              </div>
            </>
          )}
        </div>
      </Sheet>

      <PickerSheet
        isOpen={pickerCompte}
        title={t("Compte tiré")}
        value={compteId}
        onDismiss={() => setPickerCompte(false)}
        onSelect={(id) => {
          setCompteId(id);
          const c = comptes?.find((x) => x.id === id);
          if (c) remplirDepuisCompte(c);
          setPickerCompte(false);
        }}
        options={(comptes ?? []).map((c) => ({
          value: c.id,
          label: `${c.banque}${c.agence ? ` ${c.agence}` : ""}`,
          meta: ribLisible(c.rib),
        }))}
      />
      <PickerSheet
        isOpen={pickerFournisseur}
        title={t("À l'ordre de")}
        onDismiss={() => setPickerFournisseur(false)}
        onSelect={(id) => {
          const f = fournisseurs.find((x) => x.id === id);
          if (f) maj("ordre", f.nom);
          setPickerFournisseur(false);
        }}
        emptyLabel={t("Aucun fournisseur.")}
        options={fournisseurs.map((f) => ({
          value: f.id,
          label: f.nom,
          meta:
            f.solde > 0
              ? `${t("Dû")} ${f.solde.toFixed(3)} TND`
              : f.ville ?? undefined,
          keywords: `${f.ref} ${f.matriculeFiscal ?? ""}`,
        }))}
      />
      <CompteBancaireSheet
        isOpen={nouveauCompte}
        onDismiss={() => setNouveauCompte(false)}
        titulairePropose={societe?.nom}
        onEnregistre={(c) => {
          setComptes((l) => [...(l ?? []), c]);
          setCompteId(c.id);
          remplirDepuisCompte(c);
        }}
      />
    </>
  );
}

function valeursVides(aujourdhui: string): ValeursEffet {
  return {
    numero: "",
    montant: 0,
    ordre: "",
    dateCreation: aujourdhui,
    lieu: "",
    echeance: "",
    payeur: "",
    monnaie: "Dinars",
  };
}
