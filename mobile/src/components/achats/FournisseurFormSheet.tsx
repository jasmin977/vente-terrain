import { useEffect, useState } from "react";
import { checkmarkOutline } from "ionicons/icons";
import { ApiError } from "../../api/client";
import { createFournisseur, updateFournisseur } from "../../api/achats";
import type { Fournisseur, FournisseurInput } from "../../types/achat";
import { Button, Field, PageNotice, Sheet } from "../../ui";
import { t } from "../../i18n";

const VIDE: FournisseurInput = { nom: "", matriculeFiscal: "", telephone: "", email: "", adresse: "", ville: "", contact: "", notes: "" };

interface Props {
  isOpen: boolean;
  /** Fournisseur à modifier ; absent : création. */
  fournisseur?: Fournisseur | null;
  onDismiss: () => void;
  onEnregistre: (f: Fournisseur) => void;
}

/** Fiche fournisseur : création ou modification. */
export default function FournisseurFormSheet({ isOpen, fournisseur, onDismiss, onEnregistre }: Props) {
  const [champs, setChamps] = useState<FournisseurInput>(VIDE);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setErreur(null);
    setChamps(
      fournisseur
        ? {
            nom: fournisseur.nom,
            matriculeFiscal: fournisseur.matriculeFiscal ?? "",
            telephone: fournisseur.telephone ?? "",
            email: fournisseur.email ?? "",
            adresse: fournisseur.adresse ?? "",
            ville: fournisseur.ville ?? "",
            contact: fournisseur.contact ?? "",
            notes: fournisseur.notes ?? "",
          }
        : VIDE,
    );
  }, [isOpen, fournisseur]);

  const maj = (cle: keyof FournisseurInput) => (v: string) => setChamps((c) => ({ ...c, [cle]: v }));

  const enregistrer = async () => {
    setEnCours(true);
    setErreur(null);
    try {
      const f = fournisseur ? await updateFournisseur(fournisseur.id, champs) : await createFournisseur(champs);
      onEnregistre(f);
      onDismiss();
    } catch (err) {
      setErreur(err instanceof ApiError ? err.message : t("Impossible d'enregistrer le fournisseur"));
    } finally {
      setEnCours(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      title={fournisseur ? t("Fournisseur n° {n}", { n: fournisseur.ref }) : t("Nouveau fournisseur")}
      large
      onDismiss={onDismiss}
      footer={
        <div className="rc-achat__pied">
          <Button size="lg" icon={checkmarkOutline} loading={enCours} disabled={!champs.nom.trim()} onClick={enregistrer}>
            {t("Enregistrer")}
          </Button>
        </div>
      }
    >
      <div className="rc-achat__form">
        {erreur && <PageNotice>{erreur}</PageNotice>}
        <div className="rc-achat__ligne2">
          <Field label={t("Nom")} value={champs.nom} onChange={maj("nom")} required />
          <Field label={t("Matricule fiscal")} value={champs.matriculeFiscal ?? ""} onChange={maj("matriculeFiscal")} placeholder="1234567/A/M/000" />
        </div>
        <div className="rc-achat__ligne2">
          <Field label={t("Téléphone")} inputMode="tel" value={champs.telephone ?? ""} onChange={maj("telephone")} />
          <Field label={t("E-mail")} type="email" value={champs.email ?? ""} onChange={maj("email")} />
        </div>
        <div className="rc-achat__ligne2">
          <Field label={t("Adresse")} value={champs.adresse ?? ""} onChange={maj("adresse")} />
          <Field label={t("Ville")} value={champs.ville ?? ""} onChange={maj("ville")} />
        </div>
        <div className="rc-achat__ligne2">
          <Field label={t("Personne à contacter")} value={champs.contact ?? ""} onChange={maj("contact")} />
          <Field label={t("Notes")} value={champs.notes ?? ""} onChange={maj("notes")} />
        </div>
      </div>
    </Sheet>
  );
}
