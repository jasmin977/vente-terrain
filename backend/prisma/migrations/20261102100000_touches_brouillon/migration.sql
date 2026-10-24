-- Brouillon des touches rapides de la caisse (publié vers caisse_familles / caisse_touches au clic « Synchroniser »).
CREATE TABLE "caisse_touches_brouillons" (
    "societeId" TEXT NOT NULL,
    "contenu" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "caisse_touches_brouillons_pkey" PRIMARY KEY ("societeId")
);
ALTER TABLE "caisse_touches_brouillons" ADD CONSTRAINT "caisse_touches_brouillons_societeId_fkey" FOREIGN KEY ("societeId") REFERENCES "societes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
