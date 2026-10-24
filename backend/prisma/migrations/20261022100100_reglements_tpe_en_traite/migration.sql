-- Les règlements fournisseurs n'utilisent plus TPE : ceux déjà saisis passent en traite.
UPDATE "reglements_fournisseurs" SET "mode" = 'TRAITE' WHERE "mode" = 'TPE';
