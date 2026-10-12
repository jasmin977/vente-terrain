import type { Prisma, SourcePrix } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Les prix d'un article qui comptent pour l'historique (HT). */
export interface PrixArticle {
  prixAchat: number | { toString(): string };
  prixVente: number | { toString(): string };
  tva: number | { toString(): string };
  fodec: number | { toString(): string };
}

const n = (v: PrixArticle[keyof PrixArticle]) => Number(v.toString());
const egal = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * Note les prix en vigueur dans l'historique de l'article, seulement s'ils ont changé
 * (`ancien` null : premier prix, toujours noté). Retourne true si une ligne a été ajoutée.
 */
export async function noterPrix(
  tx: Tx,
  articleId: string,
  nouveau: PrixArticle,
  ancien: PrixArticle | null,
  source: SourcePrix,
  origine: { entreeId?: string; adminId?: string } = {},
): Promise<boolean> {
  if (
    ancien &&
    egal(n(ancien.prixAchat), n(nouveau.prixAchat)) &&
    egal(n(ancien.prixVente), n(nouveau.prixVente)) &&
    egal(n(ancien.tva), n(nouveau.tva)) &&
    egal(n(ancien.fodec), n(nouveau.fodec))
  ) {
    return false;
  }
  await tx.historiquePrix.create({
    data: {
      articleId,
      prixAchat: n(nouveau.prixAchat),
      prixVente: n(nouveau.prixVente),
      tva: n(nouveau.tva),
      fodec: n(nouveau.fodec),
      source,
      entreeId: origine.entreeId,
      adminId: origine.adminId,
    },
  });
  return true;
}
