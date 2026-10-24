CREATE TABLE "factures_vente" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTVA" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "factures_vente_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lignes_facture_vente" (
    "id" TEXT NOT NULL,
    "factureVenteId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "prixUnitaire" DECIMAL(12,6) NOT NULL,
    "tauxTva" DECIMAL(5,2) NOT NULL,
    "montantHT" DECIMAL(12,3) NOT NULL,
    "montantTTC" DECIMAL(12,3) NOT NULL,
    CONSTRAINT "lignes_facture_vente_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "factures" ADD COLUMN "factureVenteId" TEXT;

CREATE UNIQUE INDEX "factures_vente_numero_key" ON "factures_vente"("numero");
CREATE INDEX "factures_vente_societeId_idx" ON "factures_vente"("societeId");

ALTER TABLE "factures" ADD CONSTRAINT "factures_factureVenteId_fkey" FOREIGN KEY ("factureVenteId") REFERENCES "factures_vente"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "factures_vente" ADD CONSTRAINT "factures_vente_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lignes_facture_vente" ADD CONSTRAINT "lignes_facture_vente_factureVenteId_fkey" FOREIGN KEY ("factureVenteId") REFERENCES "factures_vente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lignes_facture_vente" ADD CONSTRAINT "lignes_facture_vente_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
