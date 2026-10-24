DROP INDEX "factures_vente_numero_key";
DROP INDEX "factures_vente_societeId_idx";
CREATE UNIQUE INDEX "factures_vente_societeId_numero_key" ON "factures_vente"("societeId", "numero");
