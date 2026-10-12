import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { SERVEUR_URL } from "../api/client";
import { estEnLigne } from "./sync";
import { ecrire } from "./stockage";

// Les photos des articles sont des liens : elles s'affichent en ligne seulement, rien n'est
// enregistré sur le téléphone. Hors ligne (vendeur en tournée), les articles s'affichent sans photo.

/** Adresse complète d'une photo : « /uploads/… » (anciennes photos) est servi par l'API. */
export function urlImage(src: string | null | undefined): string | null {
  if (!src) return null;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  if (src.startsWith("/uploads/")) return `${SERVEUR_URL}${src}`;
  return src; // fichier de l'app (ex. image par défaut)
}

/** Photo à afficher : le lien, seulement quand le téléphone est en ligne. */
export function imageAffichee(src: string | null | undefined): string | null {
  return estEnLigne() ? urlImage(src) : null;
}

/** Ancienne version : les photos étaient copiées sur le téléphone. On libère cette place. */
export async function nettoyerAnciennesImages(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Filesystem.rmdir({ path: "catalogue", directory: Directory.Data, recursive: true }).catch(() => undefined);
  await ecrire("images", {}).catch(() => undefined);
}
