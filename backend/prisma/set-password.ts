// Change le mot de passe d'un compte directement en base (ex. l'admin, qui n'a
// pas d'écran pour changer le sien). Usage, avec DATABASE_URL pointant sur la base :
//   NEW_PASSWORD='...' npm run set-password -- ADMIN
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const MOT_DE_PASSE_MIN = 8;

async function main() {
  const code = process.argv[2];
  const motDePasse = process.env.NEW_PASSWORD ?? "";
  if (!code) throw new Error("Indiquez le code du compte, ex. : npm run set-password -- ADMIN");
  if (motDePasse.length < MOT_DE_PASSE_MIN) throw new Error(`NEW_PASSWORD : ${MOT_DE_PASSE_MIN} caractères minimum`);

  const prisma = new PrismaClient();
  try {
    const compte = await prisma.user.findUnique({ where: { code } });
    if (!compte) throw new Error(`Aucun compte avec le code ${code} (attention aux majuscules)`);
    await prisma.user.update({
      where: { id: compte.id },
      // sessionVersion : déconnecte les sessions ouvertes avec l'ancien mot de passe.
      data: { passwordHash: await bcrypt.hash(motDePasse, 10), sessionVersion: { increment: 1 } },
    });
    console.log(`Mot de passe de ${code} (${compte.nom}) changé.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
