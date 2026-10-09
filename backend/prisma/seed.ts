import { createHash } from "crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { put } from "@vercel/blob";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Photos des articles : prisma/images/<code>.<ext>. Le seed les envoie au
// stockage du serveur et l'article garde l'adresse obtenue :
// - production (BLOB_READ_WRITE_TOKEN défini) : Vercel Blob, adresse https ;
// - développement : backend/uploads/articles, servi par l'API sous /uploads.
// Le nom contient une empreinte du contenu : une photo remplacée change
// d'adresse, et les téléphones qui l'ont gardée hors ligne la retéléchargent.
const DOSSIER_IMAGES = path.join(__dirname, "images");
const DOSSIER_UPLOADS = path.join(__dirname, "..", "uploads", "articles");
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

async function stockerImage(code: string): Promise<string | null> {
  const ext = Object.keys(TYPES).find((e) => existsSync(path.join(DOSSIER_IMAGES, `${code}.${e}`)));
  if (!ext) return null; // l'app affiche l'image par défaut
  const source = path.join(DOSSIER_IMAGES, `${code}.${ext}`);
  const contenu = readFileSync(source);
  const nom = `${code}-${createHash("sha1").update(contenu).digest("hex").slice(0, 8)}.${ext}`;
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const blob = await put(`articles/${nom}`, contenu, { access: "public", contentType: TYPES[ext], allowOverwrite: true });
    return blob.url;
  }
  mkdirSync(DOSSIER_UPLOADS, { recursive: true });
  copyFileSync(source, path.join(DOSSIER_UPLOADS, nom));
  return `/uploads/articles/${nom}`;
}

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

  // Catalogue (ordre de la liste de prix). Photo : prisma/images/<code>.<ext>
  // (voir stockerImage) ; sans photo, l'app affiche l'image par défaut.
  // prixAchat 0 = prix d'achat non renseigné (exclu du calcul de marge) ;
  // codeBarre null = pas encore de code-barres.
  const produitsCire = [
    {
      code: "010001",
      codeBarre: "3012345000001",
      designation: "GEL CIRE",
      marque: "MR JOCKER",
      unit: "160 ML",
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
      colisage: 6,
      prixVente: 5.5,
      prixAchat: 2.7,
    },
    {
      code: "010009",
      codeBarre: null,
      designation: "SERUM FIXATION MOYENNE",
      marque: "MR JOCKER",
      unit: "30 ML",
      colisage: 5,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "010010",
      codeBarre: null,
      designation: "SERUM FORTE FIXATION",
      marque: "MR JOCKER",
      unit: "30 ML",
      colisage: 5,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "010011",
      codeBarre: null,
      designation: "PRESENTOIRE GEL CIRE CREME",
      marque: "MR JOCKER",
      unit: "12 ML",
      colisage: 1,
      prixVente: 15,
      prixAchat: 10,
    },
    {
      code: "010012",
      codeBarre: null,
      designation: "PRESENTOIRE GEL CIRE GUMMY",
      marque: "MR JOCKER",
      unit: "12 ML",
      colisage: 1,
      prixVente: 15,
      prixAchat: 10,
    },
    {
      code: "020001",
      codeBarre: "3012345000002",
      designation: "CIRE WAX FLEXIBLE",
      marque: "VEVO",
      unit: "60 ML",
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
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
    {
      code: "020003",
      codeBarre: null,
      designation: "ROLL'ON ROUGE",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 6,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "020004",
      codeBarre: null,
      designation: "ROLL'ON ROSE",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 6,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "020005",
      codeBarre: null,
      designation: "ROLL'ON VERT",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 6,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "020006",
      codeBarre: null,
      designation: "ROLL'ON BLEU",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 6,
      prixVente: 5,
      prixAchat: 1.5,
    },
    {
      code: "020007",
      codeBarre: null,
      designation: "SERUM VANILLE",
      marque: "VEVO",
      unit: "100 ML",
      colisage: 6,
      prixVente: 8,
      prixAchat: 5,
    },
    {
      code: "020008",
      codeBarre: null,
      designation: "SERUM NOIX DE COCO",
      marque: "VEVO",
      unit: "100 ML",
      colisage: 6,
      prixVente: 8,
      prixAchat: 5,
    },
    {
      code: "020009",
      codeBarre: null,
      designation: "SERUM VANILLE",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 9,
      prixVente: 5.5,
      prixAchat: 4,
    },
    {
      code: "020010",
      codeBarre: null,
      designation: "SERUM NOIX DE COCO",
      marque: "VEVO",
      unit: "50 ML",
      colisage: 9,
      prixVente: 5.5,
      prixAchat: 3,
    },
    {
      code: "020011",
      codeBarre: "3012345000002",
      designation: "CIRE WAX STRONG",
      marque: "VEVO",
      unit: "60 ML",
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
      colisage: 6,
      prixVente: 4,
      prixAchat: 2.0,
    },
    {
      code: "020013",
      codeBarre: null,
      designation: "PRESENTOIR 50 DOSES GEL CIRE",
      marque: "VEVO",
      unit: "12 ML",
      colisage: 1,
      prixVente: 15,
      prixAchat: 9,
    },
    {
      code: "020014",
      codeBarre: null,
      designation: "PRESENTOIR 50 DOSES SHAMPOING CIRE",
      marque: "VEVO",
      unit: "10 ML",
      colisage: 1,
      prixVente: 13,
      prixAchat: 9,
    },
    {
      code: "020015",
      codeBarre: null,
      designation: "PRESENTOIR 50 DOSES CREME A RASER",
      marque: "VEVO",
      unit: "10 ML",
      colisage: 1,
      prixVente: 15,
      prixAchat: 11,
    },
    {
      code: "020017",
      codeBarre: null,
      designation: "PRESENTOIRE PERFUM STYLO",
      marque: "VEVO",
      unit: "20 ML",
      colisage: 12,
      prixVente: 45,
      prixAchat: 20,
    },
    {
      code: "020018",
      codeBarre: null,
      designation: "CREME A RASER",
      marque: "VEVO",
      unit: "200 ML",
      colisage: 6,
      prixVente: 27,
      prixAchat: 18,
    },
  ];

  for (const p of produitsCire) {
    const img = await stockerImage(p.code);
    await prisma.article.upsert({
      where: { societeId_code: { societeId: societe.id, code: p.code } },
      create: { ...p, img, societeId: societe.id },
      update: { ...p, img },
    });
  }
  console.log(`Photos : ${process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "backend/uploads/articles"}`);

  await prisma.client.upsert({
    where: { societeId_code: { societeId: societe.id, code: "CLI001" } },
    create: {
      societeId: societe.id,
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
