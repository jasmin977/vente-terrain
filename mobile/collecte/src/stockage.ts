/**
 * Données gardées sur le PDA (localStorage) : connexion, catalogue d'articles pour afficher les noms hors ligne,
 * et les collectes (en cours, à envoyer, envoyées). Rien n'est perdu si le Wi-Fi coupe.
 */

export interface ArticleCatalogue {
  id: string;
  designation: string;
  /** Tous les codes qui désignent l'article : code-barres principal, secondaires, code article. */
  codes: string[];
}

export interface LigneCollecte {
  codeBarre: string;
  quantite: number;
  designation: string | null;
}

export type StatutCollecte = "brouillon" | "a_envoyer" | "envoyee";

export interface Collecte {
  id: string;
  /** Société qui reçoit la collecte (chacune a sa liste). */
  societeId: string;
  nom: string;
  lignes: LigneCollecte[];
  statut: StatutCollecte;
  creeLe: number;
  envoyeeLe?: number;
  erreur?: string;
}

const CLES = {
  session: "collecte.session",
  catalogue: "collecte.catalogue",
  collectes: "collecte.collectes",
  reglages: "collecte.reglages",
  config: "scanstock.config",
  suppressions: "scanstock.suppressions",
};

function lire<T>(cle: string, defaut: T): T {
  try {
    const v = localStorage.getItem(cle);
    return v ? (JSON.parse(v) as T) : defaut;
  } catch {
    return defaut;
  }
}
function ecrire(cle: string, valeur: unknown) {
  localStorage.setItem(cle, JSON.stringify(valeur));
}


/** Réglages de l'appareil (menu ☰) : adresse du serveur et société des collectes. Pas de compte. */
export interface Config {
  serveur: string;
  societeId: string;
  societeNom: string;
}
export const lireConfig = () => lire<Config | null>(CLES.config, null);
export const ecrireConfig = (c: Config | null) => (c ? ecrire(CLES.config, c) : localStorage.removeItem(CLES.config));

/** Catalogue d'une société (chaque société a ses articles). */
export const lireCatalogue = (societeId: string) =>
  lire<{ articles: ArticleCatalogue[]; majLe: number | null }>(`${CLES.catalogue}.${societeId}`, { articles: [], majLe: null });
export const ecrireCatalogue = (societeId: string, articles: ArticleCatalogue[]) => ecrire(`${CLES.catalogue}.${societeId}`, { articles, majLe: Date.now() });

export const lireCollectes = () => lire<Collecte[]>(CLES.collectes, []);
/** Collectes faites avant le choix d'une société : rattachées à la première société choisie. */
export function rattacherCollectes(societeId: string) {
  const liste = lireCollectes();
  if (liste.some((c) => !c.societeId)) ecrire(CLES.collectes, liste.map((c) => (c.societeId ? c : { ...c, societeId })));
}
export const ecrireCollectes = (c: Collecte[]) => ecrire(CLES.collectes, c);

/** Collectes supprimées sur l'appareil, à supprimer aussi sur le serveur (retenté tant que le Wi-Fi manque). */
export const lireSuppressions = () => lire<{ id: string; societeId: string }[]>(CLES.suppressions, []);
export const ecrireSuppressions = (l: { id: string; societeId: string }[]) => ecrire(CLES.suppressions, l);

export interface Reglages {
  /** Demander la quantité après chaque scan ; sinon chaque scan ajoute 1 (« scan en cascade »). */
  demanderQuantite: boolean;
  /** Dernière adresse de serveur saisie. */
  serveur: string;
  /**
   * Clavier de l'écran dans les champs de scan et de quantité. PDA à clavier physique (AutoID 9N) : non, le
   * scanner et les touches tapent directement ; téléphone : oui.
   */
  clavierEcran?: boolean;
}
/** Petit écran (PDA ≈ 4") : clavier physique supposé, pas de clavier à l'écran par défaut. */
const PETIT_ECRAN = typeof window !== "undefined" && Math.min(window.screen.width, window.screen.height) <= 400;
export const lireReglages = () => {
  const r = lire<Reglages>(CLES.reglages, { demanderQuantite: true, serveur: "" });
  return { ...r, clavierEcran: r.clavierEcran ?? !PETIT_ECRAN };
};
export const ecrireReglages = (r: Reglages) => ecrire(CLES.reglages, r);

/** Identifiant unique (les vieux navigateurs n'ont pas toujours crypto.randomUUID). */
export function nouvelId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
