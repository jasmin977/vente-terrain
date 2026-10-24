-- Droit de timbre (1 TND) sur chaque facture : ventes et factures fournisseurs.
ALTER TABLE "factures_vente" ADD COLUMN "timbre" DECIMAL(12,3) NOT NULL DEFAULT 1;
ALTER TABLE "achats" ADD COLUMN "timbre" DECIMAL(12,3) NOT NULL DEFAULT 0;
UPDATE "achats" SET "timbre" = 1 WHERE "type" = 'FACTURE';
