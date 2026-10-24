-- Un BL ou une facture fournisseur fait entrer sa marchandise au dépôt.
ALTER TABLE "achats" ADD COLUMN "stockAjoute" BOOLEAN NOT NULL DEFAULT false;
