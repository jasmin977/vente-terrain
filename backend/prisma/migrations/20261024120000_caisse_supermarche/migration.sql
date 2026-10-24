-- CreateEnum
CREATE TYPE "TypeSociete" AS ENUM ('DEPOT', 'SUPERMARCHE');

-- CreateEnum
CREATE TYPE "StatutSessionCaisse" AS ENUM ('OUVERTE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "TypeTicket" AS ENUM ('VENTE', 'RETOUR');

-- CreateEnum
CREATE TYPE "ModeReglementCaisse" AS ENUM ('ESPECES', 'TPE', 'CHEQUE', 'TICKET_RESTO', 'BON_ACHAT');

-- CreateEnum
CREATE TYPE "TypeMouvementCaisse" AS ENUM ('PRELEVEMENT', 'APPORT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SensMouvementDepot" ADD VALUE 'VENTE_CAISSE';
ALTER TYPE "SensMouvementDepot" ADD VALUE 'RETOUR_CAISSE';

-- DropForeignKey
ALTER TABLE "collectes" DROP CONSTRAINT "collectes_userId_fkey";

-- DropForeignKey
ALTER TABLE "inventaires" DROP CONSTRAINT "inventaires_vendeurId_fkey";


-- AlterTable
ALTER TABLE "societes" ADD COLUMN     "type" "TypeSociete" NOT NULL DEFAULT 'DEPOT';

-- CreateTable
CREATE TABLE "caisses" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cleEmpreinte" TEXT,
    "codeAppairage" TEXT,
    "codeExpireLe" TIMESTAMP(3),
    "appaireeLe" TIMESTAMP(3),
    "derniereSyncLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "caisses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caissiers" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "droits" JSONB NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "caissiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_familles" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "couleur" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "caisse_familles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_touches" (
    "id" TEXT NOT NULL,
    "familleId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "libelle" TEXT,
    "couleur" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "caisse_touches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_sessions" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "caisseId" TEXT NOT NULL,
    "caissierId" TEXT NOT NULL,
    "statut" "StatutSessionCaisse" NOT NULL DEFAULT 'OUVERTE',
    "ouverteLe" TIMESTAMP(3) NOT NULL,
    "fondCaisse" DECIMAL(12,3) NOT NULL,
    "clotureeLe" TIMESTAMP(3),
    "numeroZ" INTEGER,
    "especesComptees" DECIMAL(12,3),

    CONSTRAINT "caisse_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_tickets" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "caisseId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "caissierId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "TypeTicket" NOT NULL DEFAULT 'VENTE',
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTVA" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    "remise" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "rendu" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caisse_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_tickets_lignes" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,3) NOT NULL,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "remise" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "quantiteOfferte" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "promotionId" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "caisse_tickets_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_tickets_paiements" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "mode" "ModeReglementCaisse" NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,
    "reference" TEXT,

    CONSTRAINT "caisse_tickets_paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caisse_mouvements" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" "TypeMouvementCaisse" NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,
    "motif" TEXT,
    "date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caisse_mouvements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "caisses_cleEmpreinte_key" ON "caisses"("cleEmpreinte");

-- CreateIndex
CREATE UNIQUE INDEX "caisses_societeId_numero_key" ON "caisses"("societeId", "numero");

-- CreateIndex
CREATE INDEX "caissiers_societeId_idx" ON "caissiers"("societeId");

-- CreateIndex
CREATE INDEX "caisse_familles_societeId_idx" ON "caisse_familles"("societeId");

-- CreateIndex
CREATE INDEX "caisse_touches_familleId_idx" ON "caisse_touches"("familleId");

-- CreateIndex
CREATE INDEX "caisse_sessions_societeId_ouverteLe_idx" ON "caisse_sessions"("societeId", "ouverteLe");

-- CreateIndex
CREATE INDEX "caisse_sessions_caisseId_idx" ON "caisse_sessions"("caisseId");

-- CreateIndex
CREATE INDEX "caisse_tickets_societeId_date_idx" ON "caisse_tickets"("societeId", "date");

-- CreateIndex
CREATE INDEX "caisse_tickets_sessionId_idx" ON "caisse_tickets"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "caisse_tickets_caisseId_numero_key" ON "caisse_tickets"("caisseId", "numero");

-- CreateIndex
CREATE INDEX "caisse_tickets_lignes_ticketId_idx" ON "caisse_tickets_lignes"("ticketId");

-- CreateIndex
CREATE INDEX "caisse_tickets_lignes_articleId_idx" ON "caisse_tickets_lignes"("articleId");

-- CreateIndex
CREATE INDEX "caisse_tickets_paiements_ticketId_idx" ON "caisse_tickets_paiements"("ticketId");

-- CreateIndex
CREATE INDEX "caisse_mouvements_sessionId_idx" ON "caisse_mouvements"("sessionId");

-- AddForeignKey
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collectes" ADD CONSTRAINT "collectes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisses" ADD CONSTRAINT "caisses_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caissiers" ADD CONSTRAINT "caissiers_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_familles" ADD CONSTRAINT "caisse_familles_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_touches" ADD CONSTRAINT "caisse_touches_familleId_fkey" FOREIGN KEY ("familleId") REFERENCES "caisse_familles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_touches" ADD CONSTRAINT "caisse_touches_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_caisseId_fkey" FOREIGN KEY ("caisseId") REFERENCES "caisses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_sessions" ADD CONSTRAINT "caisse_sessions_caissierId_fkey" FOREIGN KEY ("caissierId") REFERENCES "caissiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets" ADD CONSTRAINT "caisse_tickets_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets" ADD CONSTRAINT "caisse_tickets_caisseId_fkey" FOREIGN KEY ("caisseId") REFERENCES "caisses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets" ADD CONSTRAINT "caisse_tickets_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "caisse_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets" ADD CONSTRAINT "caisse_tickets_caissierId_fkey" FOREIGN KEY ("caissierId") REFERENCES "caissiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets_lignes" ADD CONSTRAINT "caisse_tickets_lignes_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "caisse_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets_lignes" ADD CONSTRAINT "caisse_tickets_lignes_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_tickets_paiements" ADD CONSTRAINT "caisse_tickets_paiements_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "caisse_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caisse_mouvements" ADD CONSTRAINT "caisse_mouvements_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "caisse_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

