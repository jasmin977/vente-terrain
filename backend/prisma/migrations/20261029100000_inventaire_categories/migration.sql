-- Inventaire tournant : le dépôt peut être inventorié par catégorie.
ALTER TABLE "inventaires" ADD COLUMN "categorieIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "inventaires" ADD COLUMN "libelle" TEXT;
