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

  const vendeurPassword = await bcrypt.hash(motDePasseVendeur, 10);
  await prisma.user.upsert({
    where: { code: "V001" },
    create: {
      code: "V001",
      nom: "Ahmed Ben Salah",
      role: "VENDEUR",
      passwordHash: vendeurPassword,
    },
    update: {},
  });

  const produitsCire = [
    {
      code: "010001",
      codeBarre: "3012345000001",
      designation: "GEL CIRE",
      marque: "MR JOCKER",
      unit: "160 ML",
      img: "/articles/010001.png",
      colisage: 6,
      prixVente: 5,
      prixAchat: 2.5,
    },
    {
      code: "010002",
      codeBarre: "3012345000001",
      designation: "GEL CIRE CREME",
      marque: "MR JOCKER",
      unit: "160 ML",
      img: "/articles/010002.png",
      colisage: 6,
      prixVente: 5,
      prixAchat: 2.5,
    },
    {
      code: "010003",
      codeBarre: "3012345000001",
      designation: "GEL CIRE GUMMY",
      marque: "MR JOCKER",
      unit: "160 ML",
      img: "/articles/010003.png",
      colisage: 6,
      prixVente: 5,
      prixAchat: 2.5,
    },
    {
      code: "010004",
      codeBarre: "3012345000001",
      designation: "GEL CIRE POMMADE CREME",
      marque: "MR JOCKER",
      unit: "160 ML",
      img: "/articles/010004.png",
      colisage: 6,
      prixVente: 5,
      prixAchat: 2.5,
    },
    {
      code: "010005",
      codeBarre: "3012345000001",
      designation: "CIRE-WAX ORANGE",
      marque: "MR JOCKER",
      unit: "100 ML",
      img: "/articles/010005.png",
      colisage: 6,
      prixVente: 5.5,
      prixAchat: 2.7,
    },
    {
      code: "010006",
      codeBarre: "3012345000001",
      designation: "CIRE-WAX VERT",
      marque: "MR JOCKER",
      unit: "100 ML",
      img: "/articles/010006.png",
      colisage: 6,
      prixVente: 5.5,
      prixAchat: 2.7,
    },
    {
      code: "010007",
      codeBarre: "3012345000001",
      designation: "CIRE CREME WAX",
      marque: "MR JOCKER",
      unit: "100 ML",
      img: "/articles/010007.png",
      colisage: 6,
      prixVente: 5.5,
      prixAchat: 2.7,
    },
    {
      code: "010008",
      codeBarre: "3012345000002",
      designation: "CIRE POMMADE WAX",
      marque: "MR JOCKER",
      unit: "100 ML",
      img: "/articles/010008.png",
      colisage: 6,
      prixVente: 5.5,
      prixAchat: 2.7,
    },
    {
      code: "020001",
      codeBarre: "3012345000002",
      designation: "CIRE WAX FLEXIBLE",
      marque: "VEVO",
      unit: "60 ML",
      img: "/articles/020001.png",
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
    {
      code: "020002",
      codeBarre: "3012345000002",
      designation: "CIRE CREME FLEXIBLE",
      marque: "VEVO",
      unit: "60 ML",
      img: "/articles/020002.png",
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
    {
      code: "020011",
      codeBarre: "3012345000002",
      designation: "CIRE WAX STRONG",
      marque: "VEVO",
      unit: "60 ML",
      img: "/articles/020011.png",
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
    {
      code: "020012",
      codeBarre: "3012345000002",
      designation: "CIRE CREME POMMADE",
      marque: "VEVO",
      unit: "60 ML",
      img: "/articles/020012.png",
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
  ];

  for (const p of produitsCire) {
    await prisma.article.upsert({
      where: { code: p.code },
      create: { ...p },
      update: { ...p },
    });
  }

  await prisma.client.upsert({
    where: { code: "CLI001" },
    create: {
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
  const affiche = (mdp: string, variable: string) => (process.env[variable] ? `(${variable})` : mdp);
  console.log(`  admin  -> code=ADMIN   mot de passe=${affiche(motDePasseAdmin, "SEED_ADMIN_PASSWORD")}`);
  console.log(`  vendeur-> code=V001    mot de passe=${affiche(motDePasseVendeur, "SEED_VENDEUR_PASSWORD")}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
