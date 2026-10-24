-- Promotions : prix promo et vente en lot, appliquées sur les BL de vente.
CREATE TYPE "TypePromotion" AS ENUM ('PRIX', 'LOT');
CREATE TYPE "ModeLot" AS ENUM ('CADEAU', 'UN_PLUS_UN', 'DEUXIEME_MOITIE', 'N_PLUS_UN', 'PRIX_LOT');

CREATE TABLE "promotions" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "type" "TypePromotion" NOT NULL,
    "mode" "ModeLot",
    "numero" TEXT NOT NULL,
    "libelle" TEXT,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promotions_societeId_numero_key" ON "promotions"("societeId", "numero");
CREATE INDEX "promotions_societeId_dateDebut_dateFin_idx" ON "promotions"("societeId", "dateDebut", "dateFin");
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "promotions_lignes" (
    "id" TEXT NOT NULL,
    "promotionId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "prixPromo" DECIMAL(12,6),
    "articleOffertId" TEXT,
    "quantiteOfferte" DECIMAL(12,3),
    "seuil" INTEGER,
    "tailleLot" INTEGER,
    "prixLot" DECIMAL(12,6),
    "ordre" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "promotions_lignes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "promotions_lignes_promotionId_idx" ON "promotions_lignes"("promotionId");
CREATE INDEX "promotions_lignes_articleId_idx" ON "promotions_lignes"("articleId");
ALTER TABLE "promotions_lignes" ADD CONSTRAINT "promotions_lignes_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "promotions_lignes" ADD CONSTRAINT "promotions_lignes_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "promotions_lignes" ADD CONSTRAINT "promotions_lignes_articleOffertId_fkey" FOREIGN KEY ("articleOffertId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lignes_facture" ADD COLUMN "quantiteOfferte" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "lignes_facture" ADD COLUMN "remise" DECIMAL(12,3) NOT NULL DEFAULT 0;
ALTER TABLE "lignes_facture" ADD COLUMN "promotionId" TEXT;
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
