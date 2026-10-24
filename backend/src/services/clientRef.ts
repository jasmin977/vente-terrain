import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

/** Crée un client avec la prochaine référence de la société (max + 1) ; réessaie si deux créations se croisent. */
export async function creerClientAvecRef(data: Omit<Prisma.ClientUncheckedCreateInput, "ref">) {
  for (let essai = 0; ; essai++) {
    try {
      const dernier = await prisma.client.aggregate({ where: { societeId: data.societeId }, _max: { ref: true } });
      return await prisma.client.create({ data: { ...data, ref: (dernier._max.ref ?? 0) + 1 } });
    } catch (err) {
      const cible = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002" ? String(err.meta?.target ?? "") : "";
      if (essai < 4 && cible.includes("ref")) continue;
      throw err;
    }
  }
}
