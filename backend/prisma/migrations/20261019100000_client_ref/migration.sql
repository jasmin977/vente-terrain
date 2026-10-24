ALTER TABLE "clients" ADD COLUMN "ref" INTEGER;

UPDATE "clients" c
SET "ref" = r.rn
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "societeId" ORDER BY "createdAt", "id") AS rn
  FROM "clients"
) r
WHERE c."id" = r."id";

ALTER TABLE "clients" ALTER COLUMN "ref" SET NOT NULL;

CREATE UNIQUE INDEX "clients_societeId_ref_key" ON "clients"("societeId", "ref");
