

-- CreateTable
CREATE TABLE "collectes" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nom" TEXT,
    "termineeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importeeLe" TIMESTAMP(3),
    "importeeDans" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "collectes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_collecte" (
    "id" TEXT NOT NULL,
    "collecteId" TEXT NOT NULL,
    "codeBarre" TEXT NOT NULL,
    "quantite" DECIMAL(12,3) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_collecte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collectes_societeId_importeeLe_idx" ON "collectes"("societeId", "importeeLe");

-- CreateIndex
CREATE INDEX "lignes_collecte_collecteId_idx" ON "lignes_collecte"("collecteId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "collectes" ADD CONSTRAINT "collectes_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collectes" ADD CONSTRAINT "collectes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_collecte" ADD CONSTRAINT "lignes_collecte_collecteId_fkey" FOREIGN KEY ("collecteId") REFERENCES "collectes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

