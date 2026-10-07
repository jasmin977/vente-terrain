export interface Client {
  id: string;
  code: string;
  nomCommerce: string;
  responsable?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  ville?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  actif: boolean;
  solde: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClientInput {
  code: string;
  nomCommerce: string;
  responsable?: string;
  telephone?: string;
  adresse?: string;
  ville?: string;
  latitude?: number;
  longitude?: number;
}

export interface ClientHistorique {
  solde: number;
  factures: Array<{
    id: string;
    numero: string;
    date: string;
    typeVente: "COMPTANT" | "CREDIT";
    montantTTC: number;
    statut: "VALIDEE" | "ANNULEE";
    reglement?: { paye: number; reste: number } | null;
  }>;
  retours: Array<{ id: string; date: string; motif?: string | null }>;
  paiements: Array<{ id: string; date: string; montant: number; mode: string }>;
}
