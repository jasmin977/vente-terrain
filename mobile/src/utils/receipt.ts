import EscPosPrinter from "../plugins/escPosPrinter";
import { getPrinterIp } from "../lib/printerSettings";
import type { Facture } from "../types/facture";
import { formatMoney } from "./format";
import { societeImprimee } from "./societe";

const ESC = 0x1b;
const GS = 0x1d;
const LINE_WIDTH = 42; // environ 42 caractères par ligne sur un ticket 80mm

// Les imprimantes thermiques n'impriment pas l'UTF-8 (page de code PC437 par
// défaut) : « é » sortirait en « ├⌐ ». On imprime donc les lettres sans accent.
const sansAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function buildReceiptBytes(facture: Facture): Uint8Array {
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  const raw = (b: number[]) => bytes.push(...b);
  const text = (s: string) => raw(Array.from(encoder.encode(sansAccents(s))));
  const line = (left: string, right: string) => {
    const space = Math.max(1, LINE_WIDTH - left.length - right.length);
    text(left + " ".repeat(space) + right + "\n");
  };

  raw([ESC, 0x40]); // initialiser l'imprimante
  raw([ESC, 0x61, 0x01]); // centrer
  raw([ESC, 0x45, 0x01]); // gras on
  const SOCIETE = societeImprimee();
  text(`${SOCIETE.nom}\n`);
  raw([ESC, 0x45, 0x00]); // gras off
  text(`${SOCIETE.activite}\n`);
  if (SOCIETE.matriculeFiscal) text(`MF : ${SOCIETE.matriculeFiscal}\n`);
  if (SOCIETE.adresse) text(`${SOCIETE.adresse}\n`);
  if (SOCIETE.telephone) text(`Tel : ${SOCIETE.telephone}\n`);
  text("\n");
  text(`Bon de livraison N° ${facture.numero}\n`);
  text(`${new Date(facture.date).toLocaleString()}\n`);
  raw([ESC, 0x61, 0x00]); // aligner à gauche
  text("-".repeat(LINE_WIDTH) + "\n");
  text(`Client: ${facture.client?.nomCommerce ?? facture.clientId}\n`);
  if (facture.vendeur) text(`Vendeur: ${facture.vendeur.nom}\n`);
  text("-".repeat(LINE_WIDTH) + "\n");

  for (const l of facture.lignes) {
    text(`${l.article.designation}\n`);
    line(`  ${Number(l.quantite)} x ${formatMoney(l.prixUnitaire)}`, formatMoney(l.montantTTC));
  }

  text("-".repeat(LINE_WIDTH) + "\n");
  line("Total HT", formatMoney(facture.montantHT));
  line("TVA", formatMoney(facture.montantTVA));
  raw([ESC, 0x45, 0x01]);
  line("TOTAL TTC", formatMoney(facture.montantTTC));
  raw([ESC, 0x45, 0x00]);
  text(`Paiement: ${facture.typeVente === "CREDIT" ? "CREDIT" : facture.modePaiement ?? "-"}\n`);
  text("\n\n\n");
  raw([GS, 0x56, 0x00]); // couper le papier

  return new Uint8Array(bytes);
}

function toBase64(data: Uint8Array): string {
  let binary = "";
  data.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

export interface PrintResult {
  ok: boolean;
  reason?: "not_configured" | "error";
  message?: string;
}

export async function printReceipt(facture: Facture): Promise<PrintResult> {
  const host = await getPrinterIp();
  if (!host) return { ok: false, reason: "not_configured" };

  try {
    const data = toBase64(buildReceiptBytes(facture));
    await EscPosPrinter.printRaw({ host, port: 9100, data });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: "error", message: err instanceof Error ? err.message : "Erreur d'impression" };
  }
}
