import { registerPlugin } from "@capacitor/core";

/** Impression d'un PDF sur une imprimante classique (écran « Imprimer » d'Android). */
export interface PdfPrinterPlugin {
  print(options: { data: string; name?: string }): Promise<void>;
}

const PdfPrinter = registerPlugin<PdfPrinterPlugin>("PdfPrinter");

export default PdfPrinter;
