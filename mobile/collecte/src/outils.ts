import { Capacitor } from "@capacitor/core";

let audio: AudioContext | null = null;

/** Bip court : aigu pour un article reconnu, grave et double pour un code inconnu. */
export function bip(ok: boolean) {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const jouer = (debut: number, frequence: number, duree: number) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.frequency.value = frequence;
      o.type = "square";
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(audio!.destination);
      o.start(audio!.currentTime + debut);
      o.stop(audio!.currentTime + debut + duree);
    };
    if (ok) jouer(0, 1800, 0.08);
    else {
      jouer(0, 380, 0.14);
      jouer(0.2, 380, 0.14);
    }
  } catch {
    // pas de son : pas grave
  }
  if (!ok && "vibrate" in navigator) navigator.vibrate?.([80, 60, 80]);
}

/**
 * Scan avec la caméra (téléphone de test). Sur le PDA, la touche de scan tape directement le code dans le champ :
 * cette fonction n'est alors pas utile. Renvoie null si annulé ou indisponible.
 */
export async function scannerAvecCamera(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== "granted" && camera !== "limited") throw new Error("Accès à la caméra refusé.");
  const { barcodes } = await BarcodeScanner.scan();
  return barcodes[0]?.rawValue ?? null;
}

export const cameraDisponible = () => Capacitor.isNativePlatform();

/** « 12.5 », « 12,5 » → 12.5 ; vide ou invalide → 0. */
export const nombre = (texte: string) => Number(texte.replace(",", ".").replace(/\s/g, "")) || 0;

export const quantiteTexte = (n: number) => String(Number(n.toFixed(3)));

export function dateHeure(ms: number | string) {
  const d = new Date(ms);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
