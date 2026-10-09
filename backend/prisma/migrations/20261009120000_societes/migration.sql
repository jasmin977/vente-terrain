-- Sociétés : chaque société a ses articles, clients, vendeurs et bons d'entrée.
-- Les données existantes sont rattachées à la première société (Revive Cosmetix).

-- CreateTable
CREATE TABLE "societes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "activite" TEXT,
    "matriculeFiscal" TEXT,
    "adresse" TEXT,
    "telephone" TEXT,
    "logo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "societes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "societes_code_key" ON "societes"("code");

-- Première société : celle des données déjà présentes.
INSERT INTO "societes" ("id", "code", "nom", "activite", "matriculeFiscal", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000001', 'RC', 'BONNE AFFAIRE REVIVE COSMETIX',
        'Fabrication de parfums et de cosmétiques', '1896028Y/A/M/000', CURRENT_TIMESTAMP);

-- Colonnes ajoutées, remplies, puis rendues obligatoires.
ALTER TABLE "articles" ADD COLUMN "societeId" TEXT;
ALTER TABLE "clients" ADD COLUMN "societeId" TEXT;
ALTER TABLE "entrees_depot" ADD COLUMN "societeId" TEXT;
ALTER TABLE "users" ADD COLUMN "societeId" TEXT;

UPDATE "articles" SET "societeId" = '00000000-0000-4000-8000-000000000001';
UPDATE "clients" SET "societeId" = '00000000-0000-4000-8000-000000000001';
UPDATE "entrees_depot" SET "societeId" = '00000000-0000-4000-8000-000000000001';
UPDATE "users" SET "societeId" = '00000000-0000-4000-8000-000000000001' WHERE "role" = 'VENDEUR';

ALTER TABLE "articles" ALTER COLUMN "societeId" SET NOT NULL;
ALTER TABLE "clients" ALTER COLUMN "societeId" SET NOT NULL;
ALTER TABLE "entrees_depot" ALTER COLUMN "societeId" SET NOT NULL;

-- Codes article / matricule client : uniques par société.
DROP INDEX "articles_code_key";
DROP INDEX "clients_code_key";
CREATE UNIQUE INDEX "articles_societeId_code_key" ON "articles"("societeId", "code");
CREATE UNIQUE INDEX "clients_societeId_code_key" ON "clients"("societeId", "code");
CREATE INDEX "entrees_depot_societeId_idx" ON "entrees_depot"("societeId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "articles" ADD CONSTRAINT "articles_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clients" ADD CONSTRAINT "clients_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "entrees_depot" ADD CONSTRAINT "entrees_depot_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
