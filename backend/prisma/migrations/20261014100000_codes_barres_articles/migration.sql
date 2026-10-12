-- Codes-barres supplémentaires d'un article (saveurs, variantes).
CREATE TABLE "articles_codes_barres" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "societeId" TEXT NOT NULL,
    "codeBarre" TEXT NOT NULL,
    "libelle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "articles_codes_barres_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "articles_codes_barres_societeId_codeBarre_key" ON "articles_codes_barres"("societeId", "codeBarre");
CREATE INDEX "articles_codes_barres_articleId_idx" ON "articles_codes_barres"("articleId");

ALTER TABLE "articles_codes_barres" ADD CONSTRAINT "articles_codes_barres_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
