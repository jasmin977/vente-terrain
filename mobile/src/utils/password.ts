// Mots de repli quand le prénom ne s'écrit pas en lettres latines (ou est vide).
const MOTS = ["jasmin", "olive", "soleil", "palmier", "sahara", "atlas", "medina", "corail", "cedre", "etoile"];

function hasard(max: number): number {
  const n = new Uint32Array(1);
  crypto.getRandomValues(n);
  return n[0] % max;
}

/**
 * Mot de passe facile à retenir et à taper sur un téléphone : le prénom du
 * vendeur en minuscules suivi de 4 chiffres au hasard (« karim4827 »). Les
 * chiffres restent aléatoires : un mot de passe tiré seulement du nom, du
 * téléphone ou du matricule se devinerait.
 */
export function genererMotDePasse(nom = ""): string {
  const prenom = (nom.trim().split(/\s+/)[0] ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "") // accents (é → e)
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, 10);
  const mot = prenom.length >= 3 ? prenom : MOTS[hasard(MOTS.length)];
  const chiffres = String(hasard(10000)).padStart(4, "0");
  return `${mot}${chiffres}`;
}

/** Prochain code vendeur libre au format V001, V002… */
/** Prochain code vendeur : préfixe de la société (RC-V002) pour rester unique dans toute l'app. */
export function prochainCodeVendeur(codes: string[], prefixe?: string): string {
  const max = codes.reduce((m, c) => {
    const n = /^(?:[A-Z0-9]+-)?V(\d+)$/i.exec(c.trim());
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  const code = `V${String(max + 1).padStart(3, "0")}`;
  return prefixe ? `${prefixe}-${code}` : code;
}
