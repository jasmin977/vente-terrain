import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { TextRecognition } from "@capacitor-mlkit/text-recognition";

/** La lecture de texte (ML Kit) n'existe que dans l'application mobile. */
export const lectureTexteDisponible = () => Capacitor.isNativePlatform();

const FICHIER = "ocr/image.jpg";

/**
 * Texte reconnu dans une image JPEG (base64, sans l'en-tête data:). ML Kit lit un fichier :
 * l'image est écrite dans le cache de l'application, au même endroit à chaque lecture.
 */
export async function lireTexteImage(base64: string): Promise<string> {
  const { uri } = await Filesystem.writeFile({ path: FICHIER, data: base64, directory: Directory.Cache, recursive: true });
  const { text } = await TextRecognition.processImage({ path: uri });
  return text;
}

export async function effacerImageLue() {
  try {
    await Filesystem.deleteFile({ path: FICHIER, directory: Directory.Cache });
  } catch {
    // déjà absente
  }
}
