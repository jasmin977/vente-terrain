import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

// Situation de crédit d'un client, calculée à partir des factures à crédit et
// des encaissements.
//
// - Seules les factures CREDIT validées constituent une dette. Les paiements
//   rattachés à une facture COMPTANT (enregistrés automatiquement à la vente)
//   ne réduisent pas la dette : ils soldent leur propre facture.
// - Un paiement rattaché à une facture CREDIT réduit cette facture.
// - Les avances (paiements sans facture) — ainsi que les paiements d'une facture
//   CREDIT annulée depuis — sont imputées aux factures les plus anciennes
//   d'abord (FIFO). L'imputation est calculée, rien n'est découpé en base.

type Client = Prisma.TransactionClient | typeof prisma;

const arrondi = (n: number) => Math.round(n * 1000) / 1000;
const EPS = 0.0005;

export type ModePaiement = "ESPECES" | "CHEQUE" | "VIREMENT" | "TPE";
/** Montant encaissé par mode de paiement. */
export type ParMode = Partial<Record<ModePaiement, number>>;

export interface FactureCredit {
  id: string;
  numero: string;
  date: Date;
  vendeur: { id: string; nom: string; code: string };
  montantTTC: number;
  paye: number;
  reste: number;
}

export interface SituationCredit {
  totalDu: number;
  /** Factures à crédit avec un reste à payer, de la plus ancienne à la plus récente. */
  factures: FactureCredit[];
}

export interface Reglement {
  paye: number;
  reste: number;
  /** Répartition du montant réglé selon le mode de chaque paiement / avance imputé. */
  parMode: ParMode;
}

const ajouter = (pm: ParMode, mode: ModePaiement, m: number) => {
  pm[mode] = arrondi((pm[mode] ?? 0) + m);
};

async function calculer(db: Client, clientIds?: string[]) {
  const whereClient = clientIds ? { clientId: { in: clientIds } } : {};
  const [factures, paiements] = await Promise.all([
    db.facture.findMany({
      where: { ...whereClient, typeVente: "CREDIT", statut: "VALIDEE", deletedAt: null },
      select: {
        id: true,
        clientId: true,
        numero: true,
        date: true,
        montantTTC: true,
        vendeur: { select: { id: true, nom: true, code: true } },
      },
      orderBy: { date: "asc" },
    }),
    db.paiement.findMany({
      where: { ...whereClient, deletedAt: null },
      select: {
        clientId: true,
        montant: true,
        mode: true,
        factureId: true,
        facture: { select: { typeVente: true, statut: true } },
      },
      // Les avances sont consommées dans l'ordre où elles ont été reçues.
      orderBy: { date: "asc" },
    }),
  ]);

  // Paiements rattachés à une facture à crédit, et avances (file par client).
  const parFacture = new Map<string, { mode: ModePaiement; montant: number }[]>();
  const pool = new Map<string, { mode: ModePaiement; montant: number }[]>();
  for (const p of paiements) {
    const chunk = { mode: p.mode as ModePaiement, montant: Number(p.montant) };
    if (p.facture?.typeVente === "COMPTANT") continue; // solde sa propre vente comptant
    if (p.factureId && p.facture?.statut === "VALIDEE") {
      parFacture.set(p.factureId, [...(parFacture.get(p.factureId) ?? []), chunk]);
    } else {
      pool.set(p.clientId, [...(pool.get(p.clientId) ?? []), chunk]);
    }
  }

  const situations = new Map<string, SituationCredit>();
  const reglements = new Map<string, Reglement>();
  for (const f of factures) {
    const montant = Number(f.montantTTC);
    const parMode: ParMode = {};
    let paye = 0;
    // 1. Paiements faits sur cette facture ; l'excédent rejoint les avances.
    for (const c of parFacture.get(f.id) ?? []) {
      const pris = Math.min(c.montant, montant - paye);
      if (pris > 0) {
        paye += pris;
        ajouter(parMode, c.mode, pris);
      }
      if (c.montant - pris > EPS) pool.set(f.clientId, [...(pool.get(f.clientId) ?? []), { mode: c.mode, montant: c.montant - pris }]);
    }
    // 2. Avances du client, les plus anciennes d'abord.
    const file = pool.get(f.clientId) ?? [];
    while (montant - paye > EPS && file.length) {
      const c = file[0];
      const pris = Math.min(c.montant, montant - paye);
      paye += pris;
      ajouter(parMode, c.mode, pris);
      c.montant -= pris;
      if (c.montant <= EPS) file.shift();
    }
    const reste = arrondi(montant - paye);
    reglements.set(f.id, { paye: arrondi(paye), reste: Math.max(0, reste), parMode });

    const s = situations.get(f.clientId) ?? { totalDu: 0, factures: [] };
    if (reste > EPS) {
      s.factures.push({
        id: f.id,
        numero: f.numero,
        date: f.date,
        vendeur: f.vendeur,
        montantTTC: arrondi(montant),
        paye: arrondi(paye),
        reste,
      });
      s.totalDu = arrondi(s.totalDu + reste);
    }
    situations.set(f.clientId, s);
  }
  // Client avec un crédit d'avance non imputé : dette négative (on lui doit).
  for (const [clientId, file] of pool) {
    const restant = file.reduce((t, c) => t + c.montant, 0);
    if (restant > EPS) {
      const s = situations.get(clientId) ?? { totalDu: 0, factures: [] };
      s.totalDu = arrondi(s.totalDu - restant);
      situations.set(clientId, s);
    }
  }
  return { situations, reglements };
}

export async function situationClient(clientId: string, db: Client = prisma): Promise<SituationCredit> {
  return (await calculer(db, [clientId])).situations.get(clientId) ?? { totalDu: 0, factures: [] };
}

export async function situationsClients(clientIds?: string[], db: Client = prisma) {
  return (await calculer(db, clientIds)).situations;
}

/** Solde dû par le client (positif = le client doit de l'argent). */
export async function calculerSolde(clientId: string, db: Client = prisma): Promise<number> {
  return (await situationClient(clientId, db)).totalDu;
}

/**
 * Règlement de chaque facture à crédit validée (déjà payé / reste / par mode),
 * avec la même imputation que l'écran Crédits (avances sur les plus anciennes
 * d'abord). Les factures comptant ou annulées n'ont pas d'entrée.
 */
export async function reglementsFactures(
  factures: { id: string; clientId: string; typeVente: string; statut: string }[],
  db: Client = prisma
): Promise<Map<string, Reglement>> {
  const credit = factures.filter((f) => f.typeVente === "CREDIT" && f.statut === "VALIDEE");
  if (credit.length === 0) return new Map();
  const { reglements } = await calculer(db, [...new Set(credit.map((f) => f.clientId))]);
  return new Map(credit.filter((f) => reglements.has(f.id)).map((f) => [f.id, reglements.get(f.id)!]));
}
