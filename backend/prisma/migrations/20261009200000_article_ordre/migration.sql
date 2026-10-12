-- Position de l'article dans le catalogue (ordre des lignes du fichier Excel
-- importé). Les articles existants sont rangés par référence.
ALTER TABLE "articles" ADD COLUMN "ordre" INTEGER;

UPDATE "articles" a
SET "ordre" = r.n
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "societeId" ORDER BY "code" NULLS LAST, "designation") AS n
  FROM "articles"
) r
WHERE a.id = r.id;
