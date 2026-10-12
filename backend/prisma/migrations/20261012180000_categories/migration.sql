-- Catégories d'articles : arbre catégorie › sous-catégorie propre à chaque société.
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "parentId" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "categories_societeId_parentId_idx" ON "categories"("societeId", "parentId");

ALTER TABLE "categories" ADD CONSTRAINT "categories_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "articles" ADD COLUMN "categorieId" TEXT;
CREATE INDEX "articles_categorieId_idx" ON "articles"("categorieId");
ALTER TABLE "articles" ADD CONSTRAINT "articles_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
