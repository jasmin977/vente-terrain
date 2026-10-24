/** « plage » : période libre (Du / Au) choisie au PC. */
export type PeriodeTableauDeBord = "jour" | "semaine" | "mois" | "plage";

export interface PointSerie {
  /** Heure (« 14h ») ou jour du mois (« 6 »). */
  libelle: string;
  debut: string;
  montant: number;
}

export interface TableauDeBord {
  periode: PeriodeTableauDeBord;
  /** Graduation du graphique des ventes. */
  pas?: "heure" | "jour" | "mois";
  debut: string;
  fin: string;
  precedent: { debut: string; fin: string };
  chiffreAffaires: {
    ttc: number;
    precedentTtc: number;
    /** Évolution en % par rapport à la même durée de la période précédente ; null sans base. */
    evolution: number | null;
    nbFactures: number;
    nbFacturesPrecedent: number;
    panierMoyen: number;
    /** Part vendue à crédit sur la période. */
    credit: number;
    serie: PointSerie[];
  };
  encaissements: { total: number; parMode: Partial<Record<"ESPECES" | "CHEQUE" | "VIREMENT" | "TPE", number>> };
  credits: {
    totalDu: number;
    nbClients: number;
    anciennete: { moins30: number; de30a60: number; plus60: number };
    topDebiteurs: {
      clientId: string;
      totalDu: number;
      plusAncienne: string | null;
      client: { id: string; nomCommerce: string; code: string } | null;
    }[];
  };
  vendeurs: { id: string; nom: string; code: string; actif: boolean; montant: number; nbFactures: number }[];
  topClients: { id: string; nomCommerce: string; code: string; montant: number; nb: number }[];
  topProduits: { articleId: string; designation: string; quantite: number; montantHT: number }[];
  marge: {
    ht: number;
    caHT: number;
    taux: number | null;
    /** Part du CA HT couverte par le calcul (articles avec prix d'achat). */
    couverture: number;
    complete: boolean;
    lignesSansPrixAchat: number;
  };
  stock: { depot: number; camions: number };
  facturesVente: { nb: number; total: number; blAFacturer: { nb: number; total: number } };
  achats: { total: number; precedent: number; evolution: number | null; nbBL: number; totalBL: number; nbFactures: number; totalFactures: number; nbEntrees: number; totalEntrees: number };
  fournisseurs: {
    du: number;
    nbAPayer: number;
    regle: number;
    regleParMode: Partial<Record<"ESPECES" | "CHEQUE" | "VIREMENT" | "TRAITE" | "TPE", number>>;
    topAPayer: { id: string; nom: string; ref: number; divers: boolean; solde: number; nbImpayes: number }[];
  };
  depenses: { total: number; nb: number; precedent: number; evolution: number | null; parCategorie: { id: string; nom: string; montant: number; nb: number }[] };
  /** Encaissements clients − (fournisseurs payés + dépenses) sur la période. */
  tresorerie: {
    entrees: number;
    /** Fournisseurs payés (traites à leur échéance) + dépenses. */
    sorties: number;
    solde: number;
    /** Traites arrivées à échéance dans la période (comprises dans les sorties). */
    traitesEchues?: number;
    /** Traites remises, pas encore échues : l'argent sortira plus tard. */
    traitesAVenir?: { nb: number; total: number };
  };
}
