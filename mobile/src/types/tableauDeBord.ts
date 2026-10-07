export type PeriodeTableauDeBord = "jour" | "semaine" | "mois";

export interface PointSerie {
  /** Heure (« 14h ») ou jour du mois (« 6 »). */
  libelle: string;
  debut: string;
  montant: number;
}

export interface TableauDeBord {
  periode: PeriodeTableauDeBord;
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
}
