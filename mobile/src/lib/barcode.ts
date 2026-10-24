import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { t } from "../i18n";

export type ScanResult = { code: string } | { error: string } | { cancelled: true };

/**
 * Le scanner à caméra n'existe que dans l'application du téléphone. Sur le web (ordinateur), on utilise
 * une douchette : elle « tape » le code dans le champ actif, suivi d'Entrée.
 */
export const scanCameraDisponible = () => Capacitor.isNativePlatform();

/**
 * Ouvre le scanner de code-barres (ML Kit). Utilisé par la fiche article et
 * par tous les champs de recherche de produits.
 */
export async function scannerCodeBarre(): Promise<ScanResult> {
  if (!scanCameraDisponible()) {
    return { error: t("Le scan du code-barres n'est disponible que dans l'application mobile.") };
  }
  try {
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") return { error: t("Autorisation caméra refusée") };
    try {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
    } catch {
      // module déjà installé, ou non nécessaire sur cette plateforme
    }
    const { barcodes } = await BarcodeScanner.scan();
    const code = barcodes[0]?.rawValue?.trim();
    return code ? { code } : { cancelled: true };
  } catch {
    return { error: t("Échec du scan du code-barres") };
  }
}

/**
 * Scan en continu (plusieurs articles à la suite) : la caméra tourne derrière l'application, chaque code lu est
 * envoyé à `onCode`. Renvoie la fonction qui arrête la caméra. La page doit être transparente pendant le scan
 * (classe « scan-continu » sur la racine du document).
 */
export async function demarrerScanContinu(onCode: (code: string) => void): Promise<{ arreter: () => Promise<void> } | { error: string }> {
  if (!scanCameraDisponible()) return { error: t("Le scan du code-barres n'est disponible que dans l'application mobile.") };
  try {
    const { camera } = await BarcodeScanner.requestPermissions();
    if (camera !== "granted" && camera !== "limited") return { error: t("Autorisation caméra refusée") };
    const ecoute = await BarcodeScanner.addListener("barcodesScanned", (e) => {
      for (const b of e.barcodes) {
        const code = b.rawValue?.trim();
        if (code) onCode(code);
      }
    });
    document.documentElement.classList.add("scan-continu");
    await BarcodeScanner.startScan();
    return {
      arreter: async () => {
        document.documentElement.classList.remove("scan-continu");
        await ecoute.remove();
        await BarcodeScanner.stopScan().catch(() => undefined);
      },
    };
  } catch {
    document.documentElement.classList.remove("scan-continu");
    return { error: t("Impossible d'ouvrir la caméra") };
  }
}
