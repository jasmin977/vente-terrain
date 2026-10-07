-- AlterTable
ALTER TABLE "mouvements_depot" ADD COLUMN     "entreeId" TEXT;

-- CreateTable
CREATE TABLE "entrees_depot" (
    "id" TEXT NOT NULL,
    "reference" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "entrees_depot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_entree_depot" (
    "id" TEXT NOT NULL,
    "entreeId" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "lignes_entree_depot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entrees_depot_date_idx" ON "entrees_depot"("date");

-- CreateIndex
CREATE INDEX "mouvements_depot_entreeId_idx" ON "mouvements_depot"("entreeId");

-- AddForeignKey
ALTER TABLE "mouvements_depot" ADD CONSTRAINT "mouvements_depot_entreeId_fkey" FOREIGN KEY ("entreeId") REFERENCES "entrees_depot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrees_depot" ADD CONSTRAINT "entrees_depot_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_entree_depot" ADD CONSTRAINT "lignes_entree_depot_entreeId_fkey" FOREIGN KEY ("entreeId") REFERENCES "entrees_depot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_entree_depot" ADD CONSTRAINT "lignes_entree_depot_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Reprise des entrées dépôt existantes : avant cette migration, une réception
-- n'était qu'un ensemble de mouvements ENTREE. On regroupe en un document
-- EntreeDepot les mouvements de même référence enregistrés à moins de 2 s
-- d'intervalle (une même réception est écrite dans une seule transaction),
-- pour qu'ils apparaissent dans l'historique et puissent être supprimés.
CREATE TEMP TABLE _mvts_entree AS
SELECT id, reference, date,
       sum(CASE WHEN prev IS NULL OR date - prev > interval '2 seconds' THEN 1 ELSE 0 END)
         OVER (PARTITION BY reference ORDER BY date) AS grp
FROM (
  SELECT id, reference, date,
         lag(date) OVER (PARTITION BY reference ORDER BY date) AS prev
  FROM "mouvements_depot"
  WHERE sens = 'ENTREE' AND "entreeId" IS NULL
) t;

CREATE TEMP TABLE _groupes_entree AS
SELECT gen_random_uuid()::text AS id, reference, grp, min(date) AS date
FROM _mvts_entree
GROUP BY reference, grp;

INSERT INTO "entrees_depot" (id, reference, date, "createdAt")
SELECT id, reference, date, date FROM _groupes_entree;

UPDATE "mouvements_depot" m
SET "entreeId" = g.id
FROM _mvts_entree x
JOIN _groupes_entree g ON g.reference IS NOT DISTINCT FROM x.reference AND g.grp = x.grp
WHERE m.id = x.id;

INSERT INTO "lignes_entree_depot" (id, "entreeId", "articleId", quantite)
SELECT gen_random_uuid()::text, m."entreeId", m."articleId", m.quantite
FROM "mouvements_depot" m
JOIN _groupes_entree g ON g.id = m."entreeId";

DROP TABLE _mvts_entree;
DROP TABLE _groupes_entree;
