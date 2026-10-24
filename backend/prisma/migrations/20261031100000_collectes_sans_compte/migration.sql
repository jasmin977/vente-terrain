-- Scan Stock (employés du dépôt) envoie ses collectes sans compte.
ALTER TABLE "collectes" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "collectes" ADD COLUMN "appareil" TEXT;
