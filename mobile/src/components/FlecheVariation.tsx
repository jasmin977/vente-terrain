/**
 * Flèche diagonale d'une variation de prix d'achat : vers le haut à droite (hausse, rouge : le
 * fournisseur est plus cher) ou vers le bas à droite (baisse, verte).
 */
export default function FlecheVariation({ sens, label }: { sens: "hausse" | "baisse"; label: string }) {
  const hausse = sens === "hausse";
  return (
    <svg
      className={`rc-variation rc-variation--${sens}`}
      viewBox="0 0 24 24"
      width="22"
      height="22"
      role="img"
      aria-label={label}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {hausse ? <path d="M6 18 18 6M8 6h10v10" /> : <path d="M6 6l12 12M18 8v10H8" />}
    </svg>
  );
}
