// Tickets imprimés (80 mm) : ticket de vente / retour, rapport X et clôture Z. HTML envoyé à l'imprimante Windows
// par Electron, sans boîte de dialogue.
import type { ConfigCaisse, MouvementLocal, ModeReglement, SessionLocale, TicketValide } from "../types";
import { arrondir, dateHeure, montant, quantite } from "./format";
import { pont } from "./stockage";

export const LIBELLES_MODES: Record<ModeReglement, string> = {
  ESPECES: "Espèces",
  TPE: "TPE",
  CHEQUE: "Chèque",
  TICKET_RESTO: "Ticket restaurant",
  BON_ACHAT: "Ticket cadeau",
};

const echapper = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const page = (corps: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { width: 72mm; margin: 0 auto; padding: 3mm 0 6mm; font: 12px/1.35 "Consolas", "Courier New", monospace; color: #000; }
h1 { font-size: 16px; margin: 0; text-align: center; }
.c { text-align: center; }
.l { display: flex; justify-content: space-between; gap: 6px; }
.l span:last-child { white-space: nowrap; }
.sep { border-top: 1px dashed #000; margin: 4px 0; }
.g { font-size: 16px; font-weight: bold; }
.p { font-size: 11px; }
.art { margin-top: 2px; }
</style></head><body>${corps}</body></html>`;

function entete(c: ConfigCaisse) {
  const s = c.societe;
  return [
    `<h1>${echapper(s.nom)}</h1>`,
    s.activite ? `<div class="c p">${echapper(s.activite)}</div>` : "",
    s.adresse ? `<div class="c p">${echapper(s.adresse)}</div>` : "",
    s.telephone ? `<div class="c p">Tél. ${echapper(s.telephone)}</div>` : "",
    s.matriculeFiscal ? `<div class="c p">MF ${echapper(s.matriculeFiscal)}</div>` : "",
    `<div class="sep"></div>`,
  ].join("");
}

const ligne = (g: string, d: string, classe = "") => `<div class="l ${classe}"><span>${g}</span><span>${d}</span></div>`;

export function htmlTicket(c: ConfigCaisse, t: TicketValide, caissier: string, duplicata = false) {
  const lignes = t.lignes
    .map((l, i) => {
      const nom = echapper(t.designations[i] ?? "");
      const brut = arrondir(l.quantite * l.prixUnitaire);
      return [
        `<div class="art">${nom}</div>`,
        l.quantite > 0 ? ligne(`&nbsp;&nbsp;${quantite(l.quantite)} x ${montant(l.prixUnitaire)}`, montant(brut)) : "",
        l.quantiteOfferte > 0 ? ligne(`&nbsp;&nbsp;+ ${quantite(l.quantiteOfferte)} offert(s)`, "0,000") : "",
        l.remise > 0 ? ligne("&nbsp;&nbsp;Remise", `-${montant(l.remise)}`) : "",
      ].join("");
    })
    .join("");
  const pieces = t.lignes.reduce((s, l) => s + l.quantite + l.quantiteOfferte, 0);
  return page(
    [
      entete(c),
      duplicata ? `<div class="c g">DUPLICATA</div>` : "",
      t.type === "RETOUR" ? `<div class="c g">RETOUR / AVOIR</div>` : "",
      ligne(`Ticket C${c.caisse.numero}-${t.numero}`, dateHeure(t.date), "p"),
      ligne(`Caissier : ${echapper(caissier)}`, "", "p"),
      `<div class="sep"></div>`,
      lignes,
      `<div class="sep"></div>`,
      t.remise > 0 ? ligne("Remise ticket", `-${montant(t.remise)}`) : "",
      ligne(t.type === "RETOUR" ? "À REMBOURSER" : "TOTAL TTC", montant(t.total), "g"),
      ligne(`${quantite(pieces)} article(s)`, "", "p"),
      `<div class="sep"></div>`,
      t.paiements
        .map((p) => ligne(`${LIBELLES_MODES[p.mode]}${p.reference ? ` (${echapper(p.reference)})` : ""}`, montant(p.montant)))
        .join(""),
      t.rendu > 0 ? ligne("Rendu", montant(t.rendu)) : "",
      `<div class="sep"></div>`,
      `<div class="c">Merci de votre visite !</div>`,
    ].join(""),
  );
}

export interface TotauxRapport {
  nbVentes: number;
  nbRetours: number;
  ventes: number;
  retours: number;
  remises: number;
  parMode: Partial<Record<ModeReglement, number>>;
  prelevements: number;
  apports: number;
  especesAttendues: number;
}

/** Totaux de la session (rapport X / clôture Z), calculés sur les tickets gardés par la caisse. */
export function totauxSession(s: SessionLocale, tickets: TicketValide[], mouvements: MouvementLocal[]): TotauxRapport {
  const r: TotauxRapport = { nbVentes: 0, nbRetours: 0, ventes: 0, retours: 0, remises: 0, parMode: {}, prelevements: 0, apports: 0, especesAttendues: 0 };
  for (const t of tickets) {
    const signe = t.type === "VENTE" ? 1 : -1;
    if (t.type === "VENTE") {
      r.nbVentes++;
      r.ventes += t.total;
      r.remises += t.remise + t.lignes.reduce((x, l) => x + l.remise, 0);
    } else {
      r.nbRetours++;
      r.retours += t.total;
    }
    for (const p of t.paiements) r.parMode[p.mode] = arrondir((r.parMode[p.mode] ?? 0) + signe * p.montant);
    if (t.rendu) r.parMode.ESPECES = arrondir((r.parMode.ESPECES ?? 0) - signe * t.rendu);
  }
  for (const m of mouvements) {
    if (m.type === "PRELEVEMENT") r.prelevements += m.montant;
    else r.apports += m.montant;
  }
  r.ventes = arrondir(r.ventes);
  r.retours = arrondir(r.retours);
  r.remises = arrondir(r.remises);
  r.especesAttendues = arrondir(s.fondCaisse + (r.parMode.ESPECES ?? 0) - r.prelevements + r.apports);
  return r;
}

/**
 * Clôture à l'aveugle : aucun total (le caissier ne doit pas connaître le montant attendu). Le ticket accompagne
 * la recette remise au responsable, avec le montant écrit à la main et les deux signatures.
 */
export function htmlClotureAveugle(c: ConfigCaisse, s: SessionLocale, nbTickets: number, caissier: string) {
  return page(
    [
      entete(c),
      `<div class="c g">CLÔTURE Z n° ${s.numeroZ}</div>`,
      ligne(`${echapper(c.caisse.nom)} (n° ${c.caisse.numero})`, "", "p"),
      ligne(`Caissier : ${echapper(caissier)}`, "", "p"),
      ligne("Ouverture", dateHeure(s.ouverteLe), "p"),
      ligne("Clôture", dateHeure(s.clotureeLe ?? new Date()), "p"),
      ligne("Tickets", String(nbTickets), "p"),
      `<div class="sep"></div>`,
      `<div>Recette remise (espèces, hors fond de caisse) :</div><br>`,
      `<div class="l"><span>Montant :</span><span>.................... DT</span></div><br>`,
      `<div class="l"><span>Signature caissier</span><span>Signature responsable</span></div><br><br><br>`,
      `<div class="sep"></div>`,
    ].join(""),
  );
}

export function htmlRapport(c: ConfigCaisse, s: SessionLocale, t: TotauxRapport, caissier: string, type: "X" | "Z") {
  const modes = (Object.keys(LIBELLES_MODES) as ModeReglement[]).filter((m) => t.parMode[m]);
  const ecart = s.especesComptees != null ? arrondir(s.especesComptees - t.especesAttendues) : null;
  return page(
    [
      entete(c),
      `<div class="c g">${type === "Z" ? `CLÔTURE Z n° ${s.numeroZ}` : "RAPPORT X"}</div>`,
      `<div class="c p">${type === "X" ? "Lecture sans remise à zéro" : ""}</div>`,
      ligne(`${echapper(c.caisse.nom)} (n° ${c.caisse.numero})`, "", "p"),
      ligne(`Caissier : ${echapper(caissier)}`, "", "p"),
      ligne("Ouverture", dateHeure(s.ouverteLe), "p"),
      ligne(type === "Z" ? "Clôture" : "Édité le", dateHeure(s.clotureeLe ?? new Date()), "p"),
      `<div class="sep"></div>`,
      ligne(`Ventes (${t.nbVentes})`, montant(t.ventes)),
      t.nbRetours ? ligne(`Retours (${t.nbRetours})`, `-${montant(t.retours)}`) : "",
      ligne("CHIFFRE D'AFFAIRES", montant(t.ventes - t.retours), "g"),
      t.remises ? ligne("dont remises", montant(t.remises), "p") : "",
      t.nbVentes ? ligne("Panier moyen", montant(t.ventes / t.nbVentes), "p") : "",
      `<div class="sep"></div>`,
      modes.map((m) => ligne(LIBELLES_MODES[m], montant(t.parMode[m] ?? 0))).join("") || ligne("Aucun encaissement", ""),
      `<div class="sep"></div>`,
      ligne("Fond de caisse", montant(s.fondCaisse)),
      t.prelevements ? ligne("Prélèvements", `-${montant(t.prelevements)}`) : "",
      t.apports ? ligne("Apports", `+${montant(t.apports)}`) : "",
      ligne("Espèces attendues", montant(t.especesAttendues), "g"),
      s.especesComptees != null ? ligne("Espèces comptées", montant(s.especesComptees)) : "",
      ecart !== null ? ligne("Écart", `${ecart > 0 ? "+" : ""}${montant(ecart)}`, "g") : "",
      `<div class="sep"></div>`,
      type === "Z" ? `<div class="c p">Signature du caissier</div><br><br>` : "",
    ].join(""),
  );
}

export async function imprimer(html: string, imprimante: string | null): Promise<string | null> {
  const p = pont();
  if (!p) {
    // Navigateur (développement) : aperçu dans une fenêtre.
    const w = window.open("", "_blank", "width=420,height=700");
    w?.document.write(html);
    return null;
  }
  const r = await p.imprimer(html, imprimante);
  return r.ok ? null : (r.erreur ?? "Impression impossible");
}
