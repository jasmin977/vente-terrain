// Mot de passe lisible à transmettre au vendeur (sans caractères ambigus :
// pas de 0/O, 1/l/I).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function genererMotDePasse(longueur = 8): string {
  const octets = new Uint8Array(longueur);
  crypto.getRandomValues(octets);
  return Array.from(octets, (o) => ALPHABET[o % ALPHABET.length]).join("");
}

/** Prochain code vendeur libre au format V001, V002… */
export function prochainCodeVendeur(codes: string[]): string {
  const max = codes.reduce((m, c) => {
    const n = /^V(\d+)$/i.exec(c.trim());
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `V${String(max + 1).padStart(3, "0")}`;
}
