-- CreateEnum
CREATE TYPE "TypeAchat" AS ENUM ('BL', 'FACTURE');

-- CreateTable
CREATE TABLE "fournisseurs" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "ref" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "matriculeFiscal" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "adresse" TEXT,
    "ville" TEXT,
    "contact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "fournisseurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achats" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "type" "TypeAchat" NOT NULL,
    "numero" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTVA" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    "notes" TEXT,
    "factureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "achats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_achat" (
    "id" TEXT NOT NULL,
    "achatId" TEXT NOT NULL,
    "articleId" TEXT,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,6) NOT NULL,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lignes_achat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglements_fournisseurs" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "fournisseurId" TEXT NOT NULL,
    "achatId" TEXT,
    "montant" DECIMAL(12,3) NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "reglements_fournisseurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fournisseurs_societeId_idx" ON "fournisseurs"("societeId");

-- CreateIndex
CREATE UNIQUE INDEX "fournisseurs_societeId_ref_key" ON "fournisseurs"("societeId", "ref");

-- CreateIndex
CREATE INDEX "achats_societeId_type_date_idx" ON "achats"("societeId", "type", "date");

-- CreateIndex
CREATE INDEX "achats_fournisseurId_idx" ON "achats"("fournisseurId");

-- CreateIndex
CREATE INDEX "achats_factureId_idx" ON "achats"("factureId");

-- CreateIndex
CREATE INDEX "lignes_achat_achatId_idx" ON "lignes_achat"("achatId");

-- CreateIndex
CREATE INDEX "reglements_fournisseurs_societeId_date_idx" ON "reglements_fournisseurs"("societeId", "date");

-- CreateIndex
CREATE INDEX "reglements_fournisseurs_fournisseurId_idx" ON "reglements_fournisseurs"("fournisseurId");

-- CreateIndex
CREATE INDEX "reglements_fournisseurs_achatId_idx" ON "reglements_fournisseurs"("achatId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "fournisseurs" ADD CONSTRAINT "fournisseurs_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achats" ADD CONSTRAINT "achats_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achats" ADD CONSTRAINT "achats_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achats" ADD CONSTRAINT "achats_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "achats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_achat" ADD CONSTRAINT "lignes_achat_achatId_fkey" FOREIGN KEY ("achatId") REFERENCES "achats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_achat" ADD CONSTRAINT "lignes_achat_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglements_fournisseurs" ADD CONSTRAINT "reglements_fournisseurs_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglements_fournisseurs" ADD CONSTRAINT "reglements_fournisseurs_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglements_fournisseurs" ADD CONSTRAINT "reglements_fournisseurs_achatId_fkey" FOREIGN KEY ("achatId") REFERENCES "achats"("id") ON DELETE SET NULL ON UPDATE CASCADE;

