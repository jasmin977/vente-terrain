-- Plan du dépôt en 3D : bâtiment, étagères, articles rangés.
CREATE TABLE "entrepots" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "largeur" DOUBLE PRECISION NOT NULL DEFAULT 32,
    "profondeur" DOUBLE PRECISION NOT NULL DEFAULT 22,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entrepots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entrepots_societeId_key" ON "entrepots"("societeId");
ALTER TABLE "entrepots" ADD CONSTRAINT "entrepots_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "entrepot_racks" (
    "id" TEXT NOT NULL,
    "entrepotId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "allee" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "niveaux" INTEGER NOT NULL DEFAULT 4,
    "travees" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrepot_racks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "entrepot_racks_entrepotId_idx" ON "entrepot_racks"("entrepotId");
ALTER TABLE "entrepot_racks" ADD CONSTRAINT "entrepot_racks_entrepotId_fkey" FOREIGN KEY ("entrepotId") REFERENCES "entrepots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "entrepot_emplacements" (
    "id" TEXT NOT NULL,
    "rackId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "travee" INTEGER NOT NULL,
    "articleId" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entrepot_emplacements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "entrepot_emplacements_rackId_niveau_travee_articleId_key" ON "entrepot_emplacements"("rackId", "niveau", "travee", "articleId");
CREATE INDEX "entrepot_emplacements_articleId_idx" ON "entrepot_emplacements"("articleId");
ALTER TABLE "entrepot_emplacements" ADD CONSTRAINT "entrepot_emplacements_rackId_fkey" FOREIGN KEY ("rackId") REFERENCES "entrepot_racks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "entrepot_emplacements" ADD CONSTRAINT "entrepot_emplacements_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
