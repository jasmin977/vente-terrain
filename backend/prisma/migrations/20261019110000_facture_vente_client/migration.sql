ALTER TABLE "factures_vente" ADD COLUMN "clientId" TEXT;

-- Facture issue des BL d un seul client : on retrouve ce client (sinon la facture mélange des clients et reste sans client).
UPDATE "factures_vente" fv SET "clientId" = s."clientId"
FROM (
  SELECT "factureVenteId", MIN("clientId") AS "clientId"
  FROM "factures"
  WHERE "factureVenteId" IS NOT NULL
  GROUP BY "factureVenteId"
  HAVING COUNT(DISTINCT "clientId") = 1
) s
WHERE fv."id" = s."factureVenteId";

ALTER TABLE "factures_vente" ADD CONSTRAINT "factures_vente_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "factures_vente_clientId_idx" ON "factures_vente"("clientId");
