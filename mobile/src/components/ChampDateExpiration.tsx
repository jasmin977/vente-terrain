import { useEffect, useState } from "react";
import { useIonToast } from "@ionic/react";
import { cameraOutline } from "ionicons/icons";
import { lectureTexteDisponible } from "../lib/lireDate";
import ViseurDate from "./ViseurDate";
import { Field, IconButton } from "../ui";
import { dateFr } from "../utils/peremption";
import { t } from "../i18n";

/** Chiffres tapés -> « jj/mm/aaaa » : les « / » s'ajoutent tout seuls. */
function masquer(saisie: string): string {
  const c = saisie.replace(/\D/g, "").slice(0, 8);
  if (c.length <= 2) return c;
  if (c.length <= 4) return `${c.slice(0, 2)}/${c.slice(2)}`;
  return `${c.slice(0, 2)}/${c.slice(2, 4)}/${c.slice(4)}`;
}

/** « 31/12/2026 » -> « 2026-12-31 » ; chaîne vide si la date est incomplète ou n'existe pas. */
function versIso(texte: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(texte);
  if (!m) return "";
  const [j, mo, a] = [+m[1], +m[2], +m[3]];
  const d = new Date(Date.UTC(a, mo - 1, j));
  const valide = d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
  return valide ? `${a}-${m[2]}-${m[1]}` : "";
}

/**
 * Champ « date d'expiration » : l'utilisateur écrit jj/mm/aaaa (pas de calendrier), ou le viseur en
 * direct lit la date sur l'emballage. `value` / `onChange` échangent une date AAAA-MM-JJ (vide si incomplète).
 */
export default function ChampDateExpiration({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (date: string) => void;
}) {
  const [texte, setTexte] = useState(value ? dateFr(value) : "");
  const [viseur, setViseur] = useState(false);
  const [toast] = useIonToast();

  // Une date venue d'ailleurs (viseur, remise à zéro) remplace le texte ; la frappe en cours reste intacte.
  useEffect(() => {
    setTexte((courant) => (versIso(courant) === value ? courant : value ? dateFr(value) : ""));
  }, [value]);

  const saisir = (saisie: string) => {
    // En effaçant, un « / » en fin de texte part avec le chiffre qui le précède.
    const suivant = masquer(saisie.length < texte.length && texte.endsWith("/") ? saisie.slice(0, -1) : saisie);
    setTexte(suivant);
    onChange(versIso(suivant));
  };

  const ouvrir = () => {
    if (lectureTexteDisponible()) setViseur(true);
    else toast({ message: t("La lecture de la date n'est disponible que dans l'application mobile."), duration: 3500, position: "top", cssClass: "rc-toast" });
  };

  const incomplete = texte.length === 10 && !versIso(texte);

  return (
    <>
      <Field
        label={label}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={t("jj/mm/aaaa")}
        maxLength={10}
        value={texte}
        onChange={saisir}
        error={incomplete ? t("Date invalide") : undefined}
        // La lecture de la date par la caméra est propre à l'application du téléphone (ML Kit).
        suffix={lectureTexteDisponible() ? <IconButton icon={cameraOutline} label={t("Lire la date avec la caméra")} size="sm" onClick={ouvrir} /> : undefined}
      />
      <ViseurDate
        isOpen={viseur}
        onDate={(d) => {
          onChange(d);
          setViseur(false);
        }}
        onDismiss={() => setViseur(false)}
      />
    </>
  );
}
