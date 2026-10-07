/** Écran d'arrivée après connexion : le tableau de bord pour l'admin, les factures pour le vendeur. */
export const accueil = (role?: string) => (role === "ADMIN" ? "/tableau-de-bord" : "/factures");
