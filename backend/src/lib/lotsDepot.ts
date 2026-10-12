import type { Prisma } from "@prisma/client";
import { z } from "zod";

// Lots du dépôt (voir LotDepot) : une quantité d'un article par date d'expiration.
// Règle d'or : la somme des lots d'un article égale son stock dépôt (au plus, jamais négatif).
// Chaque écriture de stock appelle `ajouterLot` (réception datée) ou `synchroniserLots`
// (toute autre variation) pour garder cette égalité. Les sorties suivent le FEFO :
// la date la plus proche part en premier, les lots sans date en dernier.

type Tx = Prisma.TransactionClient;

const arrondir = (n: number) => Math.round(n * 1000) / 1000;

/** « 2026-11-30 » -> date civile stockée en base (minuit UTC). */
export const dateExpirationSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00.000Z`)), "Date invalide")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));

export function dateEnTexte(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

/** Jours entiers entre aujourd'hui (date civile en Tunisie) et la date d'expiration. */
export function joursRestants(d: Date, maintenant = new Date()): number {
  const aujourdhui = new Intl.DateTimeFormat("sv-SE", { timeZone: "Africa/Tunis" }).format(maintenant);
  return Math.round((d.getTime() - Date.parse(`${aujourdhui}T00:00:00.000Z`)) / 86_400_000);
}

/** FEFO : date la plus proche d'abord, sans date en dernier. */
function comparerFefo(a: { dateExpiration: Date | null; createdAt: Date }, b: { dateExpiration: Date | null; createdAt: Date }) {
  if ((a.dateExpiration === null) !== (b.dateExpiration === null)) return a.dateExpiration === null ? 1 : -1;
  return (a.dateExpiration?.getTime() ?? 0) - (b.dateExpiration?.getTime() ?? 0) || a.createdAt.getTime() - b.createdAt.getTime();
}

/** Ajoute `quantite` pièces à la date donnée (le stock dépôt doit déjà être incrémenté). */
export async function ajouterLot(tx: Tx, articleId: string, dateExpiration: Date | null, quantite: number, entreeId?: string) {
  if (quantite <= 0) return;
  const existant = await tx.lotDepot.findFirst({
    where: { articleId, dateExpiration, entreeId: entreeId ?? null },
  });
  if (existant) {
    await tx.lotDepot.update({ where: { id: existant.id }, data: { quantite: { increment: quantite } } });
  } else {
    await tx.lotDepot.create({ data: { articleId, dateExpiration, quantite, entreeId } });
  }
}

/**
 * Ramène la somme des lots au stock dépôt actuel de l'article.
 * - En trop : retire en FEFO (d'abord les lots du bon `prioriteEntreeId`, utile à l'annulation d'une réception).
 * - En manque : l'écart rejoint le lot sans date (stock retourné, corrigé par inventaire…).
 */
export async function synchroniserLots(tx: Tx, articleId: string, prioriteEntreeId?: string) {
  const stock = await tx.stockDepot.findUnique({ where: { articleId } });
  const cible = Math.max(0, Number(stock?.quantite ?? 0));
  const lots = await tx.lotDepot.findMany({ where: { articleId } });
  const total = arrondir(lots.reduce((s, l) => s + Number(l.quantite), 0));
  const ecart = arrondir(cible - total);
  if (ecart === 0) return;

  if (ecart > 0) {
    const sansDate = lots.find((l) => l.dateExpiration === null && !l.entreeId) ?? lots.find((l) => l.dateExpiration === null);
    if (sansDate) await tx.lotDepot.update({ where: { id: sansDate.id }, data: { quantite: { increment: ecart } } });
    else await tx.lotDepot.create({ data: { articleId, dateExpiration: null, quantite: ecart } });
    return;
  }

  let aRetirer = -ecart;
  const ordre = [...lots].sort((a, b) => {
    const pa = prioriteEntreeId && a.entreeId === prioriteEntreeId ? 0 : 1;
    const pb = prioriteEntreeId && b.entreeId === prioriteEntreeId ? 0 : 1;
    return pa - pb || comparerFefo(a, b);
  });
  for (const lot of ordre) {
    if (aRetirer <= 0) break;
    const q = Number(lot.quantite);
    if (q <= aRetirer) {
      await tx.lotDepot.delete({ where: { id: lot.id } });
      aRetirer = arrondir(aRetirer - q);
    } else {
      await tx.lotDepot.update({ where: { id: lot.id }, data: { quantite: arrondir(q - aRetirer) } });
      aRetirer = 0;
    }
  }
}
