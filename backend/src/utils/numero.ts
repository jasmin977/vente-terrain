import type { Prisma } from "@prisma/client";

// Numéro de facture court et séquentiel, par vendeur et par année :
//   V001-26-0001, V001-26-0002, …
// Les anciennes factures gardent leur numéro (F-V001-20261006224225-7191) :
// des tickets ont déjà été imprimés avec.
export async function prochainNumeroFacture(
  tx: Prisma.TransactionClient,
  vendeurCode: string,
  date: Date = new Date()
): Promise<string> {
  const prefixe = `${vendeurCode}-${String(date.getFullYear()).slice(-2)}-`;
  // Les factures ne sont jamais supprimées (annulées = statut), donc le nombre
  // existant donne le suivant ; on saute un numéro déjà pris par sécurité.
  let seq = (await tx.facture.count({ where: { numero: { startsWith: prefixe } } })) + 1;
  for (;;) {
    const numero = `${prefixe}${String(seq).padStart(4, "0")}`;
    if (!(await tx.facture.findUnique({ where: { numero }, select: { id: true } }))) return numero;
    seq++;
  }
}
