-- Le prix de vente est fixé TTC dans le métier (ex. 22,900) ; le HT en découle
-- (22,900 / 1,19 = 19,243697). Avec 3 décimales (19,244), le prix à l'unité est
-- juste mais l'écart apparaît sur les quantités (60 pièces : 1 374,022 au lieu de
-- 1 374,000) : on garde 6 décimales sur le prix de vente HT et sur le prix unitaire
-- des lignes de bon de livraison. Les valeurs existantes sont conservées telles quelles.
ALTER TABLE "articles" ALTER COLUMN "prixVente" TYPE DECIMAL(12,6);
ALTER TABLE "lignes_facture" ALTER COLUMN "prixUnitaire" TYPE DECIMAL(12,6);
