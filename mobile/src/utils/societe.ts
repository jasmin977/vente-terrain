import type { Societe } from "../types/societe";

// Société dont l'en-tête est imprimé (tickets, bons A4) : celle ouverte dans
// l'app, renseignée par SocieteProvider (vendeur : la sienne, même hors ligne).
let courante: Societe | null = null;

export function definirSocieteImprimee(societe: Societe | null) {
  courante = societe;
}

export function societeImprimee() {
  return {
    nom: courante?.nom ?? "",
    activite: courante?.activite ?? "",
    matriculeFiscal: courante?.matriculeFiscal ?? "",
    adresse: courante?.adresse ?? "",
    telephone: courante?.telephone ?? "",
  };
}
