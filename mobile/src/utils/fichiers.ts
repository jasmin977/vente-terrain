import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

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

/** Contenu d'un fichier choisi par l'utilisateur, en base64 (sans l'en-tête data:). */
export function lireFichierBase64(fichier: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onload = () => resolve(String(lecteur.result).split(",")[1] ?? "");
    lecteur.onerror = () => reject(lecteur.error ?? new Error("Lecture du fichier impossible"));
    lecteur.readAsDataURL(fichier);
  });
}
