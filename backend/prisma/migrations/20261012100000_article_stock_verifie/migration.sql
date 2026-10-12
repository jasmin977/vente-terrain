-- « Sans stock confirmé » : l'admin a vérifié qu'un article n'a réellement aucun stock
-- au dépôt (écran « À compléter »). L'article n'est alors plus signalé.
ALTER TABLE "articles" ADD COLUMN "stockVerifieAt" TIMESTAMP(3);
