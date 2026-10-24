import { useEffect, useState } from "react";
import { checkmarkOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { creerCompteBancaire, modifierCompteBancaire } from "../../api/comptesBancaires";
import type { CompteBancaire } from "../../types/effet";
import { Button, Field, PageNotice, Sheet } from "../../ui";
import { ribLisible } from "../../utils/effets";
import { t } from "../../i18n";

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
  compte?: CompteBancaire | null;
  /** Proposés à la création : nom de la société (titulaire). */
  titulairePropose?: string;
  onEnregistre: (compte: CompteBancaire) => void;
}

const chiffres = (v: string) => v.replace(/\D/g, "").slice(0, 20);

/** Compte bancaire de la société : banque, agence, RIB ; imprimés sur ses chèques et ses traites. */
export default function CompteBancaireSheet({ isOpen, onDismiss, compte, titulairePropose, onEnregistre }: Props) {
  const [banque, setBanque] = useState("");
  const [agence, setAgence] = useState("");
  const [rib, setRib] = useState("");
  const [titulaire, setTitulaire] = useState("");
  const [ville, setVille] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setBanque(compte?.banque ?? "");
    setAgence(compte?.agence ?? "");
    setRib(compte?.rib ?? "");
    setTitulaire(compte?.titulaire ?? titulairePropose ?? "");
    setVille(compte?.ville ?? "");
    setErreur(null);
  }, [isOpen, compte, titulairePropose]);

  const ribOk = chiffres(rib).length === 20;
  const pret = banque.trim() !== "" && ribOk;

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const input = { banque: banque.trim(), agence: agence.trim() || null, rib: chiffres(rib), titulaire: titulaire.trim() || null, ville: ville.trim() || null };
      const res = compte ? await modifierCompteBancaire(compte.id, input) : await creerCompteBancaire(input);
      onEnregistre(res);
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'enregistrer le compte"));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={compte ? t("Modifier le compte bancaire") : t("Nouveau compte bancaire")}
      height="auto"
      onDismiss={onDismiss}
      footer={
        <div className="rc-achat__pied">
          <Button size="lg" icon={checkmarkOutline} loading={enCours} disabled={!pret} onClick={enregistrer}>
            {t("Enregistrer")}
          </Button>
        </div>
      }
    >
      <div className="rc-achat__form">
        {erreur && <PageNotice>{erreur}</PageNotice>}
        <div className="rc-achat__ligne2">
          <Field label={t("Banque")} value={banque} onChange={setBanque} placeholder={t("ex. Banque Al Baraka")} required />
          <Field label={t("Agence")} value={agence} onChange={setAgence} placeholder={t("ex. Msaken")} />
        </div>
        <Field
          label={t("RIB (20 chiffres)")}
          inputMode="numeric"
          value={ribLisible(rib)}
          onChange={(v) => setRib(chiffres(v))}
          placeholder="00 000 0000000000000 00"
          error={rib && !ribOk ? t("Le RIB compte 20 chiffres ({n} saisis).", { n: chiffres(rib).length }) : null}
          required
        />
        <div className="rc-achat__ligne2">
          <Field label={t("Titulaire (tiré)")} value={titulaire} onChange={setTitulaire} hint={t("Imprimé comme payeur sur les traites.")} />
          <Field label={t("Ville (lieu de création)")} value={ville} onChange={setVille} placeholder={t("ex. Msaken")} />
        </div>
      </div>
    </Sheet>
  );
}
