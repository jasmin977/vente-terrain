-- AlterTable
ALTER TABLE "articles" DROP COLUMN "actif",
DROP COLUMN "famille",
DROP COLUMN "stockDepot",
ALTER COLUMN "tva" SET DEFAULT 19;
