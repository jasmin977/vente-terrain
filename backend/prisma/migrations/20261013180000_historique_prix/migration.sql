-- Historique des prix d'achat et de vente de chaque article.
CREATE TYPE "SourcePrix" AS ENUM ('CREATION', 'MODIFICATION', 'ENTREE', 'IMPORT');

ALTER TABLE "lignes_entree_depot" ADD COLUMN "prixAchat" DECIMAL(12,6);

CREATE TABLE "prix_historique" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prixAchat" DECIMAL(12,6) NOT NULL,
    "prixVente" DECIMAL(12,6) NOT NULL,
    "tva" DECIMAL(5,2) NOT NULL,
    "fodec" DECIMAL(5,2) NOT NULL,
    "source" "SourcePrix" NOT NULL,
    "entreeId" TEXT,
    "adminId" TEXT,

    CONSTRAINT "prix_historique_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "prix_historique_articleId_date_idx" ON "prix_historique"("articleId", "date");

ALTER TABLE "prix_historique" ADD CONSTRAINT "prix_historique_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Point de départ : les prix actuels de chaque article, à sa date de création.
INSERT INTO "prix_historique" ("id", "articleId", "date", "prixAchat", "prixVente", "tva", "fodec", "source")
SELECT gen_random_uuid()::text, "id", "createdAt", "prixAchat", "prixVente", "tva", "fodec", 'CREATION'
FROM "articles";
