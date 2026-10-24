import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // En production : SEED_ADMIN_PASSWORD / SEED_VENDEUR_PASSWORD (les valeurs
  // par défaut sont publiques dans le dépôt, réservées au développement).
  const motDePasseAdmin = process.env.SEED_ADMIN_PASSWORD || "admin1234";
  const motDePasseVendeur = process.env.SEED_VENDEUR_PASSWORD || "vendeur1234";
  const adminPassword = await bcrypt.hash(motDePasseAdmin, 10);
  const admin = await prisma.user.upsert({
    where: { code: "ADMIN" },
    create: {
      code: "ADMIN",
      nom: "Administrateur",
      role: "ADMIN",
      passwordHash: adminPassword,
    },
    update: {},
  });

  // Première société (même identifiant que la migration qui l'a créée).
  const societe = await prisma.societe.upsert({
    where: { code: "RC" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      code: "RC",
      nom: "BONNE AFFAIRE REVIVE COSMETIX",
      activite: "Fabrication de parfums et de cosmétiques",
      matriculeFiscal: "1896028Y/A/M/000",
    },
    update: {},
  });

  const vendeurPassword = await bcrypt.hash(motDePasseVendeur, 10);
  await prisma.user.upsert({
    where: { code: "V001" },
    create: {
      code: "V001",
      nom: "Ahmed Ben Salah",
      role: "VENDEUR",
      passwordHash: vendeurPassword,
      societeId: societe.id,
    },
    update: {},
  });

  // Pas de catalogue : chaque société importe ses articles depuis l'app
  // (Stock › Articles › Importer depuis Excel).

  await prisma.client.upsert({
    where: { societeId_code: { societeId: societe.id, code: "CLI001" } },
    create: {
      societeId: societe.id,
      ref: 1,
      code: "CLI001",
      nomCommerce: "Superette El Manar",
      responsable: "Karim",
      telephone: "20123456",
      adresse: "Avenue Habib Bourguiba",
      ville: "Tunis",
    },
    update: {},
  });

  // Dépôt et camions démarrent vides : l'admin fait l'entrée dépôt puis le
  // premier chargement camion depuis l'app.

  console.log("Seed terminé. Comptes:");
  const affiche = (mdp: string, variable: string) =>
    process.env[variable] ? `(${variable})` : mdp;
  console.log(
    `  admin  -> code=ADMIN   mot de passe=${affiche(motDePasseAdmin, "SEED_ADMIN_PASSWORD")}`,
  );
  console.log(
    `  vendeur-> code=V001    mot de passe=${affiche(motDePasseVendeur, "SEED_VENDEUR_PASSWORD")}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
