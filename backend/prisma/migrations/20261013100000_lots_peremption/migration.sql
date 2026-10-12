-- Suivi des dates d'expiration : lots de marchandise au dépôt.
ALTER TABLE "categories" ADD COLUMN "perissable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN "alerteJours" INTEGER;

ALTER TABLE "articles" ADD COLUMN "sansPeremption" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "lignes_entree_depot" ADD COLUMN "dateExpiration" DATE;

CREATE TABLE "lots_depot" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "dateExpiration" DATE,
    "quantite" DECIMAL(12,3) NOT NULL,
    "entreeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_depot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lots_depot_articleId_idx" ON "lots_depot"("articleId");
CREATE INDEX "lots_depot_dateExpiration_idx" ON "lots_depot"("dateExpiration");

ALTER TABLE "lots_depot" ADD CONSTRAINT "lots_depot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock existant : un lot « date inconnue » par article en stock (la somme des lots égale le stock).
INSERT INTO "lots_depot" ("id", "articleId", "dateExpiration", "quantite", "updatedAt")
SELECT gen_random_uuid()::text, "articleId", NULL, "quantite", now()
FROM "stock_depot"
WHERE "quantite" > 0;
