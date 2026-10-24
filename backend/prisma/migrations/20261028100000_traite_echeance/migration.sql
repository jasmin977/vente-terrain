-- Échéance des traites des règlements fournisseurs.
ALTER TABLE "reglements_fournisseurs" ADD COLUMN "echeance" TIMESTAMP(3);
CREATE INDEX "reglements_fournisseurs_echeance_idx" ON "reglements_fournisseurs"("echeance");
