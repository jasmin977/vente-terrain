import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import { t } from "../i18n";

/**
 * Enregistre un fichier produit par l'app (base64) : partage du téléphone
 * (Fichiers, Drive, WhatsApp…) ou téléchargement dans un navigateur.
 */
export async function enregistrerFichier(base64: string, nom: string, type: string, titre: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    const lien = document.createElement("a");
    lien.href = `data:${type};base64,${base64}`;
    lien.download = nom;
    lien.click();
    return;
  }
  const fichier = await Filesystem.writeFile({ path: `fichiers/${nom}`, data: base64, directory: Directory.Cache, recursive: true });
  await Share.share({ title: nom, files: [fichier.uri], dialogTitle: titre });
}

/** Fichier choisi inutilisable : le message est destiné à l'utilisateur. */
export class ErreurFichier extends Error {}

function octetsEnBase64(octets: Uint8Array): string {
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

const lireEnDataUrl = (fichier: File) =>
  new Promise<string>((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] ?? "");
    lecteur.onerror = () => reject(lecteur.error ?? new Error("Lecture du fichier impossible"));
    lecteur.readAsDataURL(fichier);
  });

/**
 * Contenu d'un fichier choisi par l'utilisateur, en base64 (sans l'en-tête data:).
 * Sur Android, un fichier reçu par WhatsApp, Drive ou OneDrive peut être lu vide par
 * le WebView : on essaie les deux méthodes de lecture avant de refuser, avec un message
 * qui dit quoi faire (le serveur ne recevrait qu'un fichier vide).
 */
export async function lireFichierBase64(fichier: File): Promise<string> {
  const essais: Array<() => Promise<string>> = [
    async () => octetsEnBase64(new Uint8Array(await fichier.arrayBuffer())),
    () => lireEnDataUrl(fichier),
  ];
  for (const essai of essais) {
    try {
      const contenu = await essai();
      if (contenu) return contenu;
    } catch {
      // méthode suivante
    }
  }
  throw new ErreurFichier(
    t("Le fichier « {nom} » est vide ou illisible. Ouvrez-le depuis le dossier Téléchargements du téléphone (pas depuis WhatsApp, Drive ou OneDrive), ou enregistrez-le d'abord sur le téléphone.", { nom: fichier.name })
  );
}
