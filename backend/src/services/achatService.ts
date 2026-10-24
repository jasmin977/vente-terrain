import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

export const arrondi = (n: number) => Math.round(n * 1000) / 1000;

/** Le fournisseur « Divers » de la société (ref 0), créé la première fois qu'on en a besoin. */
export async function fournisseurDivers(societeId: string) {
  const existant = await prisma.fournisseur.findFirst({ where: { societeId, divers: true } });
  if (existant) {
    if (existant.deletedAt) return prisma.fournisseur.update({ where: { id: existant.id }, data: { deletedAt: null } });
    return existant;
  }
  try {
    return await prisma.fournisseur.create({ data: { societeId, ref: 0, nom: "Divers", divers: true } });
  } catch {
    // Créé en même temps par une autre requête (ref 0 est unique dans la société).
    return prisma.fournisseur.findFirstOrThrow({ where: { societeId, divers: true } });
  }
}

/** Droit de timbre d'une facture (TND). */
export const TIMBRE = 1;

/** Net à payer d'un document : TTC + timbre (le timbre est nul sur un BL). */
export const netAPayer = (a: { montantTTC: Prisma.Decimal | number; timbre?: Prisma.Decimal | number | null }) =>
  arrondi(Number(a.montantTTC) + Number(a.timbre ?? 0));

export type StatutPaiement = "PAYE" | "PARTIEL" | "NON_PAYE" | "FACTURE";

export interface Situation {
  paye: number;
  reste: number;
  statut: StatutPaiement;
}

/** Ce qui est réglé sur chaque document (règlements non supprimés). */
export async function payesParAchat(achatIds: string[], tx: Prisma.TransactionClient = prisma) {
  const sommes = new Map<string, number>();
  if (achatIds.length === 0) return sommes;
  const lignes = await tx.reglementFournisseur.groupBy({
    by: ["achatId"],
    where: { achatId: { in: achatIds }, deletedAt: null },
    _sum: { montant: true },
  });
  for (const l of lignes) if (l.achatId) sommes.set(l.achatId, Number(l._sum.montant ?? 0));
  return sommes;
}

/** Statut de paiement d'un document : un BL regroupé dans une facture suit la facture (« FACTURE »). */
export function situation(
  a: { id: string; montantTTC: Prisma.Decimal | number; timbre?: Prisma.Decimal | number | null; factureId?: string | null },
  payes: Map<string, number>,
): Situation {
  if (a.factureId) return { paye: 0, reste: 0, statut: "FACTURE" };
  const paye = arrondi(payes.get(a.id) ?? 0);
  const reste = arrondi(netAPayer(a) - paye);
  return { paye, reste: Math.max(0, reste), statut: reste <= 0.0005 ? "PAYE" : paye > 0 ? "PARTIEL" : "NON_PAYE" };
}

/** Montants d'un document à partir de ses lignes (prix HT, TVA en %). */
export function calculerLignes(lignes: { articleId?: string | null; designation: string; quantite: number; prixUnitaire: number; tauxTva: number }[]) {
  const calculees = lignes.map((l) => {
    const montantHT = arrondi(l.quantite * l.prixUnitaire);
    const montantTTC = arrondi(montantHT * (1 + l.tauxTva / 100));
    return { articleId: l.articleId ?? null, designation: l.designation, quantite: l.quantite, prixUnitaire: l.prixUnitaire, tauxTva: l.tauxTva, montantHT, montantTTC };
  });
  const montantHT = arrondi(calculees.reduce((s, l) => s + l.montantHT, 0));
  const montantTTC = arrondi(calculees.reduce((s, l) => s + l.montantTTC, 0));
  return { lignes: calculees, montantHT, montantTVA: arrondi(montantTTC - montantHT), montantTTC };
}

/**
 * Ce qu'on doit à chaque fournisseur : reste des documents non réglés, moins les avances sans document.
 * Les BL regroupés dans une facture ne comptent pas (c'est la facture qui compte).
 */
export async function soldesFournisseurs(societeId: string, fournisseurIds?: string[]) {
  const docs = await prisma.achat.findMany({
    where: { societeId, deletedAt: null, factureId: null, ...(fournisseurIds ? { fournisseurId: { in: fournisseurIds } } : {}) },
    select: { id: true, fournisseurId: true, montantTTC: true, timbre: true, factureId: true },
  });
  const payes = await payesParAchat(docs.map((d) => d.id));
  const avances = await prisma.reglementFournisseur.groupBy({
    by: ["fournisseurId"],
    where: { societeId, deletedAt: null, achatId: null, ...(fournisseurIds ? { fournisseurId: { in: fournisseurIds } } : {}) },
    _sum: { montant: true },
  });
  const res = new Map<string, { du: number; nbImpayes: number; avances: number; solde: number }>();
  const ligne = (id: string) => res.get(id) ?? { du: 0, nbImpayes: 0, avances: 0, solde: 0 };
  for (const d of docs) {
    const s = situation(d, payes);
    if (s.reste <= 0) continue;
    const l = ligne(d.fournisseurId);
    l.du = arrondi(l.du + s.reste);
    l.nbImpayes += 1;
    res.set(d.fournisseurId, l);
  }
  for (const a of avances) {
    const l = ligne(a.fournisseurId);
    l.avances = arrondi(Number(a._sum.montant ?? 0));
    res.set(a.fournisseurId, l);
  }
  for (const l of res.values()) l.solde = arrondi(l.du - l.avances);
  return res;
}
