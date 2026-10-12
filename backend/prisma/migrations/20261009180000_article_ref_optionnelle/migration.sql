-- La référence (ex-code) d'un article devient facultative ; le code-barres
-- devient obligatoire côté application (les articles existants sans
-- code-barres restent valides jusqu'à leur prochaine modification).
ALTER TABLE "articles" ALTER COLUMN "code" DROP NOT NULL;
