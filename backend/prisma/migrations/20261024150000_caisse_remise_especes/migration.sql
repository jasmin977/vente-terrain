-- AlterTable
ALTER TABLE "caisse_sessions" ADD COLUMN     "especesRemises" DECIMAL(12,3),
ADD COLUMN     "remiseSaisieLe" TIMESTAMP(3),
ADD COLUMN     "remiseSaisiePar" TEXT;

-- AlterTable
ALTER TABLE "caisses" ADD COLUMN     "comptageCaissier" BOOLEAN NOT NULL DEFAULT false;

