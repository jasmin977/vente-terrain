import { Capacitor } from "@capacitor/core";
import { BarcodeScanner } from "@capacitor-mlkit/barcode-scanning";
import { t } from "../i18n";

export type ScanResult = { code: string } | { error: string } | { cancelled: true };

/**
 * Ouvre le scanner de code-barres (ML Kit). Utilisé par la fiche article et
 * par tous les champs de recherche de produits.
 */
export async function scannerCodeBarre(): Promise<ScanResult> {
  if (!Capacitor.isNativePlatform()) {
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
