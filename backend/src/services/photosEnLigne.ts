// Recherche de la photo d'un article par son code-barres dans les bases ouvertes Open Food Facts
// (aliments), Open Beauty Facts (cosmétiques, hygiène), Open Products Facts (autres produits) et
// Open Pet Food Facts (animaux). Les photos y sont stables (images.openfoodfacts.org…) et sous
// licence libre (CC BY-SA) : on garde simplement le lien de la version réduite.

type Source = "aliments" | "beaute" | "produits" | "animaux";

const HOTE: Record<Source, string> = {
  aliments: "world.openfoodfacts.org",
  beaute: "world.openbeautyfacts.org",
  produits: "world.openproductsfacts.org",
  animaux: "world.openpetfoodfacts.org",
};

/** Erreur passagère (limite de débit, réseau) : on réessaiera plus tard, la recherche n'est pas notée faite. */
export class ErreurPhotoTemporaire extends Error {}

const sansAccents = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Bases à interroger, dans l'ordre, selon la catégorie principale de l'article (deux au plus). */
export function sourcesPour(categorieRacine: string | null | undefined): Source[] {
  const c = sansAccents(categorieRacine ?? "");
  if (/cosmet|hygien|soin|beaute/.test(c)) return ["beaute", "produits"];
  if (/animaux|animal/.test(c)) return ["animaux", "produits"];
  if (/entretien|papier|emballage|divers/.test(c)) return ["produits", "aliments"];
  return ["aliments", "produits"];
}

/** Un code-barres exploitable (EAN-8, UPC, EAN-13, GTIN-14). */
export const codeBarreValide = (code: string | null | undefined): code is string => Boolean(code && /^\d{8,14}$/.test(code));

interface ProduitBrut {
  product_name?: string;
  product_name_fr?: string;
  brands?: string;
  quantity?: string;
  image_front_small_url?: string;
  image_front_url?: string;
}

export interface InfosProduit {
  nom: string | null;
  marque: string | null;
  /** Contenance telle qu'imprimée (« 160 g », « 1,5 L »). */
  quantite: string | null;
  img: string | null;
}

const lienPhoto = (p: ProduitBrut) => {
  const url = p.image_front_small_url ?? p.image_front_url;
  return url && /^https:\/\/images\.open(food|beauty|products|petfood)facts\.org\//.test(url) ? url : null;
};

/** Fiche d'un produit dans une base ouverte, ou null s'il n'y figure pas. */
async function produit(codeBarre: string, source: Source): Promise<ProduitBrut | null> {
  let rep: Response;
  try {
    rep = await fetch(`https://${HOTE[source]}/api/v2/product/${codeBarre}.json?fields=product_name,product_name_fr,brands,quantity,image_front_small_url,image_front_url`, {
      headers: { "User-Agent": "VenteTerrain/1.0 (catalogue interne)" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new ErreurPhotoTemporaire("réseau");
  }
  if (rep.status === 404) return null;
  if (!rep.ok) throw new ErreurPhotoTemporaire(`HTTP ${rep.status}`);
  let donnees: { product?: ProduitBrut };
  try {
    donnees = (await rep.json()) as typeof donnees;
  } catch {
    // Page d'erreur HTML (limite de débit) au lieu de JSON.
    throw new ErreurPhotoTemporaire("réponse illisible");
  }
  return donnees.product ?? null;
}

/** Lien de la photo de face du produit, ou null si la base ne le connaît pas / sans photo. */
export async function trouverPhoto(codeBarre: string, source: Source): Promise<string | null> {
  const p = await produit(codeBarre, source);
  return p ? lienPhoto(p) : null;
}

/**
 * Nom, marque, contenance et photo d'un produit à partir de son code-barres, en interrogeant les bases
 * ouvertes l'une après l'autre (aliments, produits, cosmétiques). Null si aucune ne le connaît ; une erreur
 * passagère n'est signalée que si aucune base n'a pu répondre.
 */
export async function infosProduit(
  codeBarre: string,
  sources: Source[] = ["aliments", "produits", "beaute"],
  pauseMs = 0,
): Promise<InfosProduit | null> {
  let erreur = false;
  for (const [i, source] of sources.entries()) {
    if (i > 0 && pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs)); // ménage les bases ouvertes
    try {
      const p = await produit(codeBarre, source);
      if (p && (p.product_name || p.product_name_fr || p.brands || p.quantity || lienPhoto(p))) {
        return {
          nom: (p.product_name_fr || p.product_name || "").trim() || null,
          marque: (p.brands ?? "").split(",")[0].trim() || null,
          quantite: (p.quantity ?? "").replace(/\s+[e℮]$/i, "").trim() || null,
          img: lienPhoto(p),
        };
      }
    } catch (err) {
      if (!(err instanceof ErreurPhotoTemporaire)) throw err;
      erreur = true;
    }
  }
  if (erreur) throw new ErreurPhotoTemporaire("bases injoignables");
  return null;
}

/** La marque proposée figure-t-elle déjà dans la désignation ? (évite d'inscrire le groupe, « Lactalis » pour « Président ») */
export function marqueDansDesignation(marque: string, designation: string) {
  return sansAccents(designation).includes(sansAccents(marque));
}
