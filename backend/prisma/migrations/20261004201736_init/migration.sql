-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'VENDEUR');

-- CreateEnum
CREATE TYPE "TypeVente" AS ENUM ('COMPTANT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'CHEQUE', 'VIREMENT', 'TPE');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "SensMouvementStock" AS ENUM ('CHARGEMENT', 'RETOUR', 'VENTE', 'AJUSTEMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'VENDEUR',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "codeBarre" TEXT,
    "designation" TEXT NOT NULL,
    "famille" TEXT,
    "marque" TEXT,
    "prixAchat" DECIMAL(12,3) NOT NULL,
    "prixVente" DECIMAL(12,3) NOT NULL,
    "colisage" INTEGER NOT NULL DEFAULT 1,
    "tva" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "stockDepot" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nomCommerce" TEXT NOT NULL,
    "responsable" TEXT,
    "telephone" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "plafondCredit" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chargements_camion" (
    "id" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "sens" "SensMouvementStock" NOT NULL DEFAULT 'CHARGEMENT',
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "chargements_camion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_chargement" (
    "id" TEXT NOT NULL,
    "chargementId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantiteColis" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lignes_chargement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_camion" (
    "id" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_camion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_stock" (
    "id" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sens" "SensMouvementStock" NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "typeVente" "TypeVente" NOT NULL DEFAULT 'COMPTANT',
    "modePaiement" "ModePaiement",
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTVA" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    "statut" "StatutFacture" NOT NULL DEFAULT 'VALIDEE',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_facture" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,3) NOT NULL,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lignes_facture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retours" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "motif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "retours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_retour" (
    "id" TEXT NOT NULL,
    "retourId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lignes_retour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "factureId" TEXT,
    "vendeurId" TEXT NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visites" (
    "id" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "clientId" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visites_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_code_key" ON "users"("code");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "articles_code_key" ON "articles"("code");

-- CreateIndex
CREATE INDEX "articles_updatedAt_idx" ON "articles"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_code_key" ON "clients"("code");

-- CreateIndex
CREATE INDEX "clients_updatedAt_idx" ON "clients"("updatedAt");

-- CreateIndex
CREATE INDEX "chargements_camion_updatedAt_idx" ON "chargements_camion"("updatedAt");

-- CreateIndex
CREATE INDEX "chargements_camion_vendeurId_idx" ON "chargements_camion"("vendeurId");

-- CreateIndex
CREATE INDEX "stock_camion_updatedAt_idx" ON "stock_camion"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_camion_vendeurId_articleId_key" ON "stock_camion"("vendeurId", "articleId");

-- CreateIndex
CREATE INDEX "mouvements_stock_vendeurId_articleId_idx" ON "mouvements_stock"("vendeurId", "articleId");

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE INDEX "factures_updatedAt_idx" ON "factures"("updatedAt");

-- CreateIndex
CREATE INDEX "factures_clientId_idx" ON "factures"("clientId");

-- CreateIndex
CREATE INDEX "factures_vendeurId_idx" ON "factures"("vendeurId");

-- CreateIndex
CREATE INDEX "retours_updatedAt_idx" ON "retours"("updatedAt");

-- CreateIndex
CREATE INDEX "paiements_updatedAt_idx" ON "paiements"("updatedAt");

-- CreateIndex
CREATE INDEX "paiements_clientId_idx" ON "paiements"("clientId");

-- CreateIndex
CREATE INDEX "visites_updatedAt_idx" ON "visites"("updatedAt");

-- CreateIndex
CREATE INDEX "visites_vendeurId_date_idx" ON "visites"("vendeurId", "date");

-- AddForeignKey
ALTER TABLE "chargements_camion" ADD CONSTRAINT "chargements_camion_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_chargement" ADD CONSTRAINT "lignes_chargement_chargementId_fkey" FOREIGN KEY ("chargementId") REFERENCES "chargements_camion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_chargement" ADD CONSTRAINT "lignes_chargement_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_camion" ADD CONSTRAINT "stock_camion_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_camion" ADD CONSTRAINT "stock_camion_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_stock" ADD CONSTRAINT "mouvements_stock_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retours" ADD CONSTRAINT "retours_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_retourId_fkey" FOREIGN KEY ("retourId") REFERENCES "retours"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retour" ADD CONSTRAINT "lignes_retour_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
