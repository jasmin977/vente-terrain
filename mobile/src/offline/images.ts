import { useEffect, useState } from "react";
import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { SERVEUR_URL } from "../api/client";
import { ecrire, lire } from "./stockage";

// Photos des articles gardées sur le téléphone : le vendeur met à jour son
// catalogue le matin (avec réseau) et voit ensuite les photos toute la journée
// sans connexion. Hors application native (navigateur), les photos viennent
// simplement du serveur.

const DOSSIER = "catalogue";
const NOM = "images";

/** Adresse complète d'une photo : « /uploads/… » est servi par l'API. */
export function urlImage(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  if (src.startsWith("/uploads/")) return `${SERVEUR_URL}${src}`;
  return src; // fichier de l'app (ex. image par défaut)
}

/** Adresse distante → fichier enregistré sur le téléphone (URI native). */
let fichiers: Record<string, string> = {};
let version = 0;
const ecouteurs = new Set<() => void>();
const notifier = () => {
  version++;
  ecouteurs.forEach((f) => f());
};

/** À appeler à l'ouverture de session : retrouve les photos déjà enregistrées. */
export async function chargerImagesHorsLigne(): Promise<void> {
  fichiers = Capacitor.isNativePlatform() ? await lire<Record<string, string>>(NOM, {}) : {};
  notifier();
}

/** Photo à afficher : copie locale si elle existe, sinon l'adresse du serveur. */
export function imageAffichee(src: string | null | undefined): string | null {
  const url = urlImage(src);
  if (!url) return null;
  const local = fichiers[url];
  return local ? Capacitor.convertFileSrc(local) : url;
}

export const nbImagesEnregistrees = () => Object.keys(fichiers).length;

/** Fait se redessiner un composant quand des photos sont enregistrées. */
export function useImagesHorsLigne(): number {
  const [, setV] = useState(version);
  useEffect(() => {
    const f = () => setV(version);
    ecouteurs.add(f);
    return () => {
      ecouteurs.delete(f);
    };
  }, []);
  return version;
}

const nomFichier = (url: string) => decodeURIComponent(url.split("?")[0].split("/").pop() ?? "photo").replace(/[^\w.-]+/g, "_");

export interface ResultatImages {
  total: number;
  enregistrees: number;
  echecs: number;
}

/**
 * Enregistre sur le téléphone les photos des articles (celles déjà présentes
 * sont gardées) et supprime celles qui ne servent plus.
 */
export async function enregistrerImagesCatalogue(
  sources: Array<string | null | undefined>,
  progression?: (fait: number, total: number) => void
): Promise<ResultatImages> {
  const urls = [...new Set(sources.map(urlImage).filter((u): u is string => Boolean(u) && /^https?:/.test(u!)))];
  if (!Capacitor.isNativePlatform()) return { total: urls.length, enregistrees: 0, echecs: 0 };

  const suivant: Record<string, string> = {};
  let echecs = 0;
  let fait = 0;
  for (const url of urls) {
    progression?.(fait, urls.length);
    if (fichiers[url]) {
      suivant[url] = fichiers[url];
    } else {
      try {
        const rep = await CapacitorHttp.get({ url, responseType: "blob", connectTimeout: 15_000, readTimeout: 30_000 });
        if (rep.status < 200 || rep.status >= 300 || typeof rep.data !== "string") throw new Error(`HTTP ${rep.status}`);
        const ecrit = await Filesystem.writeFile({
          path: `${DOSSIER}/${nomFichier(url)}`,
          data: rep.data,
          directory: Directory.Data,
          recursive: true,
        });
        suivant[url] = ecrit.uri;
      } catch {
        echecs++;
      }
    }
    fait++;
  }
  progression?.(fait, urls.length);

  // Photos d'articles supprimés ou remplacés : on libère la place.
  for (const [url, uri] of Object.entries(fichiers)) {
    if (!suivant[url] && !Object.values(suivant).includes(uri)) {
      await Filesystem.deleteFile({ path: uri }).catch(() => undefined);
    }
  }

  fichiers = suivant;
  await ecrire(NOM, fichiers);
  notifier();
  return { total: urls.length, enregistrees: Object.keys(suivant).length, echecs };
}
