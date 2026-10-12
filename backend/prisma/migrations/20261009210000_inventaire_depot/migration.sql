-- Inventaire du dépôt : un inventaire sans vendeur (vendeurId NULL) porte sur le
-- dépôt de la société. La société devient une colonne de l'inventaire (elle se
-- déduisait jusqu'ici du vendeur du camion).
ALTER TABLE "inventaires" ADD COLUMN "societeId" TEXT;

UPDATE "inventaires" i
SET "societeId" = u."societeId"
FROM "users" u
WHERE i."vendeurId" = u.id;

ALTER TABLE "inventaires" ALTER COLUMN "societeId" SET NOT NULL;
ALTER TABLE "inventaires" ALTER COLUMN "vendeurId" DROP NOT NULL;

ALTER TABLE "inventaires"
  ADD CONSTRAINT "inventaires_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "inventaires_societeId_createdAt_idx" ON "inventaires"("societeId", "createdAt");
