-- FODEC : taxe de 1 % sur le prix HT de certains articles (colonne « Fodec » des
-- exports du logiciel de gestion). La TVA se calcule ensuite sur HT + FODEC :
-- TTC = HT x (1 + FODEC) x (1 + TVA).
-- Prix de gros : second tarif (HT, 6 décimales comme le prix de vente), facultatif.
ALTER TABLE "articles" ADD COLUMN "fodec" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "articles" ADD COLUMN "prixGros" DECIMAL(12,6);
