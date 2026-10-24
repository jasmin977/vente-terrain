import type { ModeReglement } from "../types";

// Icônes des modes de règlement (traits SVG, couleur du texte) : espèces, TPE, chèque, ticket restaurant, ticket cadeau.
const TRACES: Record<ModeReglement, string> = {
  // Billet avec pièce.
  ESPECES: "M3 7h18v10H3z M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z M6 10v4 M18 10v4",
  // Terminal de paiement : écran, touches, carte insérée.
  TPE: "M7 3h10a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z M9 6h6v4H9z M9 13h1 M12 13h1 M15 13h0 M9 16h1 M12 16h1 M15 16h0",
  // Chèque avec ligne de signature.
  CHEQUE: "M2 7h20v10H2z M5 11h7 M5 14h4 M14 14l2-2 1.5 1.5L20 11",
  // Fourchette et couteau.
  TICKET_RESTO: "M7 3v8 M5 3v5a2 2 0 0 0 4 0V3 M7 11v10 M16 3c-1.7 1-2.5 3-2.5 6s1 3.5 2.5 3.5V21",
  // Paquet cadeau.
  BON_ACHAT: "M4 10h16v10H4z M3 7h18v3H3z M12 7v13 M12 7c-1.5-3-5-3-5-.5S12 7 12 7z M12 7c1.5-3 5-3 5-.5S12 7 12 7z",
};

export function IconeMode({ mode, taille = 26 }: { mode: ModeReglement; taille?: number }) {
  return (
    <svg className="icone-mode" width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={TRACES[mode]} />
    </svg>
  );
}
