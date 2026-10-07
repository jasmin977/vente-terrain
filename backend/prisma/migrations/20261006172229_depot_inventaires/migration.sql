-- CreateEnum
CREATE TYPE "SensMouvementDepot" AS ENUM ('ENTREE', 'CHARGEMENT', 'RETOUR', 'AJUSTEMENT');

-- CreateEnum
CREATE TYPE "StatutInventaire" AS ENUM ('EN_COURS', 'VALIDE');

-- CreateEnum
CREATE TYPE "MotifEcart" AS ENUM ('ENDOMMAGE', 'PERDU', 'ECHANTILLON', 'AUTRE');

-- AlterTable
ALTER TABLE "lignes_chargement" ADD COLUMN     "quantiteUnites" DECIMAL(12,3);

-- CreateTable
CREATE TABLE "stock_depot" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_depot" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "sens" "SensMouvementDepot" NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "vendeurId" TEXT,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventaires" (
    "id" TEXT NOT NULL,
    "vendeurId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "statut" "StatutInventaire" NOT NULL DEFAULT 'EN_COURS',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "dateValidation" TIMESTAMP(3),

    CONSTRAINT "inventaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_inventaire" (
    "id" TEXT NOT NULL,
    "inventaireId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantiteReelle" DECIMAL(12,3) NOT NULL,
    "quantiteTheorique" DECIMAL(12,3),
    "motif" "MotifEcart",
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lignes_inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stock_depot_articleId_key" ON "stock_depot"("articleId");

-- CreateIndex
CREATE INDEX "mouvements_depot_articleId_idx" ON "mouvements_depot"("articleId");

-- CreateIndex
CREATE INDEX "inventaires_vendeurId_createdAt_idx" ON "inventaires"("vendeurId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_inventaire_inventaireId_articleId_key" ON "lignes_inventaire"("inventaireId", "articleId");

-- AddForeignKey
ALTER TABLE "stock_depot" ADD CONSTRAINT "stock_depot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_depot" ADD CONSTRAINT "mouvements_depot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_depot" ADD CONSTRAINT "mouvements_depot_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventaires" ADD CONSTRAINT "inventaires_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_inventaire" ADD CONSTRAINT "lignes_inventaire_inventaireId_fkey" FOREIGN KEY ("inventaireId") REFERENCES "inventaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_inventaire" ADD CONSTRAINT "lignes_inventaire_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
