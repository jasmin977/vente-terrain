import type { Prisma } from "@prisma/client";

// Numéro de bon de livraison court et séquentiel, par année : 26/0001, 26/0002, …
// La séquence est commune à tous les vendeurs (le numéro est unique).
// Les anciens bons gardent leur numéro (V001-26-0001, F-V001-2026…) :
// des tickets ont déjà été imprimés avec.
export async function prochainNumeroFacture(
  tx: Prisma.TransactionClient,
  date: Date = new Date()
): Promise<string> {
  const prefixe = `${String(date.getFullYear()).slice(-2)}/`;
  // Les factures ne sont jamais supprimées (annulées = statut), donc le nombre
  // existant donne le suivant ; on saute un numéro déjà pris par sécurité.
  let seq = (await tx.facture.count({ where: { numero: { startsWith: prefixe } } })) + 1;
  for (;;) {
    const numero = `${prefixe}${String(seq).padStart(4, "0")}`;
    if (!(await tx.facture.findUnique({ where: { numero }, select: { id: true } }))) return numero;
    seq++;
  }
}
