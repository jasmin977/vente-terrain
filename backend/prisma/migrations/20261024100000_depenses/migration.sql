-- CreateTable
CREATE TABLE "categories_depense" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "categories_depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depenses" (
    "id" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "categorieId" TEXT NOT NULL,
    "montant" DECIMAL(12,3) NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "description" TEXT NOT NULL,
    "fournisseurId" TEXT,
    "beneficiaire" TEXT,
    "vendeurId" TEXT,
    "photo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "depenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "categories_depense_societeId_idx" ON "categories_depense"("societeId");

-- CreateIndex
CREATE INDEX "depenses_societeId_date_idx" ON "depenses"("societeId", "date");

-- CreateIndex
CREATE INDEX "depenses_categorieId_idx" ON "depenses"("categorieId");

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "categories_depense" ADD CONSTRAINT "categories_depense_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_categorieId_fkey" FOREIGN KEY ("categorieId") REFERENCES "categories_depense"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_fournisseurId_fkey" FOREIGN KEY ("fournisseurId") REFERENCES "fournisseurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depenses" ADD CONSTRAINT "depenses_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

