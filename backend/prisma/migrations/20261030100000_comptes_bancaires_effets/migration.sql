-- Comptes bancaires de la société et impression des chèques / traites.
CREATE TABLE "comptes_bancaires" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "banque" TEXT NOT NULL,
    "agence" TEXT,
    "rib" TEXT NOT NULL,
    "titulaire" TEXT,
    "ville" TEXT,
    "parDefaut" BOOLEAN NOT NULL DEFAULT false,
    "gabarits" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "comptes_bancaires_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comptes_bancaires_societeId_idx" ON "comptes_bancaires"("societeId");
ALTER TABLE "comptes_bancaires" ADD CONSTRAINT "comptes_bancaires_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reglements_fournisseurs" ADD COLUMN "compteBancaireId" TEXT;
ALTER TABLE "reglements_fournisseurs" ADD COLUMN "impression" JSONB;
ALTER TABLE "reglements_fournisseurs" ADD COLUMN "imprimeLe" TIMESTAMP(3);
ALTER TABLE "reglements_fournisseurs" ADD CONSTRAINT "reglements_fournisseurs_compteBancaireId_fkey" FOREIGN KEY ("compteBancaireId") REFERENCES "comptes_bancaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;
