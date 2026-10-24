-- Fournisseur « Divers » intégré et précision libre sur ses achats.
ALTER TABLE "fournisseurs" ADD COLUMN "divers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "achats" ADD COLUMN "fournisseurLibre" TEXT;
