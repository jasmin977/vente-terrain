import { registerPlugin } from "@capacitor/core";

export interface EscPosPrinterPlugin {
  printRaw(options: { host: string; port?: number; data: string }): Promise<{ success: boolean }>;
}

const EscPosPrinter = registerPlugin<EscPosPrinterPlugin>("EscPosPrinter");

export default EscPosPrinter;
