-- Recherche automatique des photos d'articles : date de la dernière tentative.
ALTER TABLE "articles" ADD COLUMN "photoCherchee" TIMESTAMP(3);
