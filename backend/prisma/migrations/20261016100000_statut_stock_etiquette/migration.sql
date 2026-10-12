-- Stock minimum et mise en avant (nouveauté / promotion) d'un article : couleurs du plan 3D du dépôt.
CREATE TYPE "EtiquetteArticle" AS ENUM ('NOUVEAU', 'PROMOTION');

ALTER TABLE "articles" ADD COLUMN "stockMini" DECIMAL(12,3);
ALTER TABLE "articles" ADD COLUMN "etiquette" "EtiquetteArticle";
ALTER TABLE "articles" ADD COLUMN "etiquetteJusqua" DATE;
