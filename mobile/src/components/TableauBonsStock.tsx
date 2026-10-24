import { useMemo, useState } from "react";
import { FilterChip, PickerSheet, SearchField, Segmented, Tag } from "../ui";
import TableauDonnees, { type ColonneDonnees } from "../ui/TableauDonnees";
import { formatDate, formatTime, pieces } from "../utils/format";
import { texteCorrespond } from "../utils/articleSearch";
import { t, tn } from "../i18n";

/** Un bon de stock (entrée au dépôt, sortie / chargement ou retour d'un camion) tel qu'affiché dans le tableau. */
export interface LigneBon {
  id: string;
  reference?: string | null;
  date: string;
  /** Reçu par (entrée) ou camion de (sortie, retour). */
  personne?: string | null;
  nbLignes: number;
  totalPieces: number;
  supprime: boolean;
}

interface Props {
  lignes: LigneBon[];
  /** Type de bon : intitulés des colonnes et des textes. */
  type: "entree" | "sortie" | "retour";
  onOuvrir: (id: string) => void;
}

const TOUS = "__tous__";

/**
 * Bons de stock en tableau (ordinateur) : N° du bon, date, heure, qui, articles, pièces et statut,
 * avec recherche, filtre par personne et par statut, tri par colonne et totaux.
 */
export default function TableauBonsStock({ lignes, type, onOuvrir }: Props) {
  const [recherche, setRecherche] = useState("");
  const [personne, setPersonne] = useState(TOUS);
  const [statut, setStatut] = useState<"tous" | "valides" | "supprimes">("tous");
  const [choixPersonne, setChoixPersonne] = useState(false);

  const personnes = useMemo(() => [...new Set(lignes.map((l) => l.personne).filter((p): p is string => Boolean(p)))].sort(), [lignes]);
  const filtrees = useMemo(
    () =>
      lignes.filter((l) => {
        if (personne !== TOUS && l.personne !== personne) return false;
        if (statut === "valides" && l.supprime) return false;
        if (statut === "supprimes" && !l.supprime) return false;
        const q = recherche.trim();
        return !q || texteCorrespond(`${l.reference ?? ""} ${l.personne ?? ""}`, q);
      }),
    [lignes, personne, statut, recherche],
  );

  const titrePersonne = type === "entree" ? t("Reçu par") : t("Camion");
  const colonnes: ColonneDonnees<LigneBon>[] = [
    { id: "ref", titre: t("N° du bon"), principale: true, rendu: (l) => l.reference || t("Sans référence"), tri: (l) => l.reference ?? "", largeur: "170px" },
    { id: "date", titre: t("Date"), rendu: (l) => formatDate(l.date), tri: (l) => new Date(l.date).getTime(), largeur: "130px" },
    { id: "heure", titre: t("Heure"), rendu: (l) => formatTime(l.date), tri: (l) => formatTime(l.date), largeur: "90px" },
    { id: "personne", titre: titrePersonne, rendu: (l) => l.personne ?? "—", tri: (l) => l.personne ?? "", souple: true },
    { id: "articles", titre: t("Articles"), rendu: (l) => l.nbLignes, tri: (l) => l.nbLignes, aligne: "end", largeur: "110px" },
    { id: "pieces", titre: t("Pièces"), rendu: (l) => l.totalPieces, tri: (l) => l.totalPieces, aligne: "end", largeur: "110px" },
    {
      id: "statut",
      titre: t("Statut"),
      rendu: (l) => (l.supprime ? <Tag tone="danger">{type === "entree" ? t("Supprimée") : t("Supprimé")}</Tag> : <Tag tone="positive">{t("Valide")}</Tag>),
      tri: (l) => (l.supprime ? 1 : 0),
      largeur: "130px",
    },
  ];

  const totalPieces = filtrees.filter((l) => !l.supprime).reduce((s, l) => s + l.totalPieces, 0);
  const libelleBon = type === "entree" ? t("bons d'entrée") : type === "sortie" ? t("bons de sortie") : t("bons de retour");

  return (
    <div className="rc-bons">
      <div className="rc-bons__filtres">
        <div className="rc-bons__recherche">
          <SearchField value={recherche} onChange={setRecherche} placeholder={t("N° du bon ou nom…")} />
        </div>
        {personnes.length > 1 && (
          <FilterChip
            label={personne === TOUS ? (type === "entree" ? t("Tous les utilisateurs") : t("Tous les camions")) : personne}
            active={personne !== TOUS}
            ariaLabel={titrePersonne}
            onOpen={() => setChoixPersonne(true)}
          />
        )}
        <div className="rc-bons__statut">
          <Segmented
            label={t("Statut")}
            value={statut}
            onChange={setStatut}
            options={[
              { value: "tous", label: t("Tous") },
              { value: "valides", label: t("Valides") },
              { value: "supprimes", label: t("Supprimés") },
            ]}
          />
        </div>
      </div>

      <TableauDonnees
        label={libelleBon}
        lignes={filtrees}
        colonnes={colonnes}
        cle={(l) => l.id}
        onOuvrir={(l) => onOuvrir(l.id)}
        attenuee={(l) => l.supprime}
        triInitial={{ colonne: "date", inverse: true }}
        pied={
          filtrees.length === 0 ? (
            t("Aucun bon ne correspond à ces filtres.")
          ) : (
            <>
              <strong>{tn(filtrees.length, "{n} bon", "{n} bons")}</strong> · {totalPieces} {pieces(totalPieces)}
            </>
          )
        }
      />

      <PickerSheet
        isOpen={choixPersonne}
        title={titrePersonne}
        value={personne}
        onDismiss={() => setChoixPersonne(false)}
        onSelect={(v) => {
          setPersonne(v);
          setChoixPersonne(false);
        }}
        options={[
          { value: TOUS, label: type === "entree" ? t("Tous les utilisateurs") : t("Tous les camions") },
          ...personnes.map((p) => ({ value: p, label: p })),
        ]}
      />
    </div>
  );
}
