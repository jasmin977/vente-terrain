/**
 * Transformation intelligente : prépare, pour une période, des factures qui regroupent les bons de livraison
 * (BL) d'un même client, en visant un total sans le dépasser et un minimum de factures (chacune coûte).
 *
 * Règles :
 *  - tous les clients peuvent être facturés ; une facture ne contient que des BL d'un seul client ;
 *  - un client n'a jamais plus de `plafond` facturé par jour, donc au plus une facture par jour ;
 *  - un BL qui dépasse seul le plafond est facturé seul (l'admin en est prévenu avant la création) ;
 *  - la date d'une facture est comprise dans la période et ≥ à la date de chacun de ses BL (un BL d'un
 *    ancien mois peut donc être facturé dans la période) ;
 *  - tous les BL des clients prioritaires sont facturés avant la fin de la période (dans la limite du total),
 *    en un minimum de factures : rien n'oblige à une facture par jour ;
 *  - le reste du total est fait avec les autres clients, ceux qui ont un matricule fiscal (MF) d'abord ;
 *  - la somme de toutes les factures ≤ total visé, au plus près, et les jours se partagent le montant.
 */

/** Matricule fiscal tunisien : des chiffres suivis d'une lettre clé (ex. 1884126/B/A/M/000). */
export const aUnMf = (code: string | null | undefined): boolean => /^\d{6,8}\s*[/\-\s]?\s*[A-Za-z]/.test((code ?? "").trim());

export interface BonPlan {
  id: string;
  numero: string;
  clientId: string;
  clientNom: string;
  clientRef?: number;
  /** Le client a un matricule fiscal. */
  mf: boolean;
  /** Jour du BL, « AAAA-MM-JJ ». */
  date: string;
  total: number;
}

export interface ParamsPlan {
  /** Période de facturation, « AAAA-MM-JJ » inclus. */
  debut: string;
  fin: string;
  /** Somme maximale de toutes les factures. */
  cible: number;
  /** Montant maximal d'une facture (sauf un BL qui le dépasse à lui seul). */
  plafond: number;
  /** Montant minimal d'une facture : un lot plus petit est ignoré (0 = pas de minimum). */
  minimum: number;
  /** Clients dont tous les BL doivent être facturés avant la fin de la période. */
  prioritaires: ReadonlySet<string>;
}

export interface FacturePlan {
  cle: string;
  date: string;
  clientId: string;
  clientNom: string;
  clientRef?: number;
  mf: boolean;
  bons: BonPlan[];
  total: number;
}

export interface ResultatPlan {
  factures: FacturePlan[];
  total: number;
  /** Total visé moins total prévu (≥ 0). */
  ecart: number;
  nbBons: number;
  /** BL qui dépassent seuls le plafond : ils sont facturés seuls, l'admin en est prévenu. */
  tropGros: BonPlan[];
  /** Total des BL disponibles dans la période. */
  disponible: number;
  /** BL laissés de côté parce que leur facture aurait été sous le minimum. */
  ignores: BonPlan[];
  /** BL de clients prioritaires qui ne tiennent pas dans le total visé : ils ne sont pas facturés. */
  prioritairesNonFactures: BonPlan[];
}

const mil = (n: number) => Math.round(n * 1000);
const de = (m: number) => m / 1000;

interface Lot {
  clientId: string;
  bons: BonPlan[];
  somme: number; // millimes
  derniere: string;
  mf: boolean;
}

export function jourSuivant(jour: string): string {
  const [y, m, d] = jour.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, d + 1));
  return `${s.getUTCFullYear()}-${String(s.getUTCMonth() + 1).padStart(2, "0")}-${String(s.getUTCDate()).padStart(2, "0")}`;
}

export function joursDe(debut: string, fin: string): string[] {
  const jours: string[] = [];
  for (let j = debut; j <= fin && jours.length < 400; j = jourSuivant(j)) jours.push(j);
  return jours;
}

export function planifier(bons: BonPlan[], p: ParamsPlan): ResultatPlan {
  const plafond = mil(p.plafond);
  const minimum = mil(p.minimum);
  const cible = mil(p.cible);
  const jours = joursDe(p.debut, p.fin);

  // Un BL peut être ancien (avant la période) : seule sa date ≤ fin compte, la facture sera datée après lui.
  const eligibles = bons.filter((b) => b.date <= p.fin && b.total > 0);
  const tropGros = eligibles.filter((b) => mil(b.total) > plafond);
  const disponible = de(eligibles.reduce((s, b) => s + mil(b.total), 0));

  const vide: ResultatPlan = { factures: [], total: 0, ecart: p.cible, nbBons: 0, tropGros, disponible, prioritairesNonFactures: [], ignores: [] };
  if (jours.length === 0 || cible <= 0 || plafond <= 0 || eligibles.length === 0) return vide;

  const parClient = new Map<string, BonPlan[]>();
  for (const b of eligibles) parClient.set(b.clientId, [...(parClient.get(b.clientId) ?? []), b]);
  for (const liste of parClient.values()) liste.sort((a, b) => a.date.localeCompare(b.date) || a.numero.localeCompare(b.numero));

  // Lots d'un client : les plus gros BL d'abord, chacun dans le premier lot où il tient (moins de factures) ;
  // un BL plus gros que le plafond forme un lot à lui seul.
  const lotsDe = (liste: BonPlan[]): Lot[] => {
    const lotsClient: Lot[] = [];
    for (const b of [...liste].sort((x, y) => y.total - x.total || x.date.localeCompare(y.date))) {
      const t = mil(b.total);
      const lot = lotsClient.find((l) => l.somme + t <= plafond);
      if (lot) {
        lot.bons.push(b);
        lot.somme += t;
        if (b.date > lot.derniere) lot.derniere = b.date;
      } else {
        lotsClient.push({ clientId: b.clientId, bons: [b], somme: t, derniere: b.date, mf: b.mf });
      }
    }
    return lotsClient;
  };

  const retenus: Lot[] = [];
  const ignores: BonPlan[] = [];
  // Un lot sous le minimum ne vaut pas une facture : ses BL sont ignorés.
  const assezGros = (l: Lot) => {
    if (l.somme >= minimum) return true;
    ignores.push(...l.bons);
    return false;
  };
  let cumul = 0;

  // 1. Clients prioritaires : tous leurs BL, sauf si le total visé ne suffit pas (les plus anciens passent d'abord).
  const lotsPrio = [...parClient.entries()].filter(([id]) => p.prioritaires.has(id)).flatMap(([, liste]) => lotsDe(liste)).filter(assezGros);
  const nonFactures: BonPlan[] = [];
  for (const l of lotsPrio.sort((a, b) => a.derniere.localeCompare(b.derniere) || b.somme - a.somme)) {
    if (cumul + l.somme <= cible) {
      retenus.push(l);
      cumul += l.somme;
    } else nonFactures.push(...l.bons);
  }
  // Un lot trop gros pour le reste du budget peut encore être allégé : on y remet les BL qui tiennent.
  const reste = nonFactures.sort((a, b) => b.total - a.total);
  for (const [clientId, liste] of Object.entries(
    reste.reduce<Record<string, BonPlan[]>>((m, b) => ((m[b.clientId] = [...(m[b.clientId] ?? []), b]), m), {}),
  )) {
    const lot: Lot = { clientId, bons: [], somme: 0, derniere: "", mf: liste[0].mf };
    for (const b of liste) {
      const t = mil(b.total);
      if (cumul + lot.somme + t <= cible && lot.somme + t <= plafond) {
        lot.bons.push(b);
        lot.somme += t;
        if (b.date > lot.derniere) lot.derniere = b.date;
      }
    }
    if (lot.bons.length > 0 && lot.somme >= minimum) {
      retenus.push(lot);
      cumul += lot.somme;
    }
  }
  const dejaPris = new Set(retenus.flatMap((l) => l.bons.map((b) => b.id)));
  const prioritairesNonFactures = lotsPrio.flatMap((l) => l.bons).filter((b) => !dejaPris.has(b.id));

  // 2. Autres clients : lots les plus pleins d'abord, ceux dont le client a un MF avant les autres,
  //    sans dépasser ce qui reste du total.
  const lots = [...parClient.entries()].filter(([id]) => !p.prioritaires.has(id)).flatMap(([, liste]) => lotsDe(liste)).filter(assezGros);
  const restants: Lot[] = [];
  const parPriorite = [...lots].sort((a, b) => Number(b.mf) - Number(a.mf) || b.somme - a.somme || a.derniere.localeCompare(b.derniere));
  let cumulB = cumul;
  for (const l of parPriorite) {
    if (cumulB + l.somme <= cible) {
      retenus.push(l);
      cumulB += l.somme;
    } else restants.push(l);
  }

  // Ce qui reste à combler : au plus trois petites factures faites de BL laissés de côté.
  const libres = restants.flatMap((l) => l.bons);
  for (let i = 0; i < 3; i++) {
    const ecart = cible - cumulB;
    if (ecart <= 0) break;
    const limite = Math.min(ecart, plafond);
    let meilleur: Lot | null = null;
    const parCl = new Map<string, BonPlan[]>();
    for (const b of libres) parCl.set(b.clientId, [...(parCl.get(b.clientId) ?? []), b]);
    for (const [clientId, liste] of parCl) {
      const tries = [...liste].sort((a, b) => b.total - a.total);
      const lot: Lot = { clientId, bons: [], somme: 0, derniere: "", mf: tries[0].mf };
      for (const b of tries) {
        const t = mil(b.total);
        if (lot.somme + t <= limite) {
          lot.bons.push(b);
          lot.somme += t;
          if (b.date > lot.derniere) lot.derniere = b.date;
        }
      }
      if (lot.somme === 0 || lot.somme < minimum) continue;
      if (!meilleur || Number(lot.mf) > Number(meilleur.mf) || (lot.mf === meilleur.mf && lot.somme > meilleur.somme)) meilleur = lot;
    }
    if (!meilleur) break;
    retenus.push(meilleur);
    cumulB += meilleur.somme;
    const pris = new Set(meilleur.bons.map((b) => b.id));
    for (let k = libres.length - 1; k >= 0; k--) if (pris.has(libres[k].id)) libres.splice(k, 1);
  }
  cumul = cumulB;

  const chargeJour = new Map(jours.map((j) => [j, { somme: 0, nb: 0 }]));
  const clientsDuJour = new Map<string, Set<string>>(jours.map((j) => [j, new Set()]));
  const factures: FacturePlan[] = [];
  const ajouter = (jour: string, bonsPris: BonPlan[], somme: number) => {
    const c = chargeJour.get(jour)!;
    c.somme += somme;
    c.nb += 1;
    clientsDuJour.get(jour)!.add(bonsPris[0].clientId);
    const premier = bonsPris[0];
    factures.push({
      cle: `${jour}|${premier.clientId}|${bonsPris.map((b) => b.id).join(",")}`,
      date: jour,
      clientId: premier.clientId,
      clientNom: premier.clientNom,
      clientRef: premier.clientRef,
      mf: premier.mf,
      bons: [...bonsPris].sort((a, b) => a.date.localeCompare(b.date) || a.numero.localeCompare(b.numero)),
      total: de(somme),
    });
  };

  // 3. Dates : chaque lot va sur le jour le moins chargé parmi ceux où il est permis (≥ ses BL les plus récents),
  //    sans deux factures du même client le même jour.
  for (const l of [...retenus].sort((a, b) => b.somme - a.somme)) {
    const permis = jours.filter((j) => j >= l.derniere);
    const candidats = permis.length > 0 ? permis : [jours[jours.length - 1]];
    const libresDuClient = candidats.filter((j) => !clientsDuJour.get(j)!.has(l.clientId));
    const parmi = libresDuClient.length > 0 ? libresDuClient : candidats;
    const jour = parmi.reduce((m, j) => {
      const a = chargeJour.get(j)!;
      const b = chargeJour.get(m)!;
      return a.somme < b.somme || (a.somme === b.somme && a.nb < b.nb) ? j : m;
    });
    ajouter(jour, l.bons, l.somme);
  }

  factures.sort((a, b) => a.date.localeCompare(b.date) || Number(b.mf) - Number(a.mf) || (a.clientRef ?? 0) - (b.clientRef ?? 0));
  return { factures, total: de(cumul), ecart: de(cible - cumul), nbBons: factures.reduce((s, f) => s + f.bons.length, 0), tropGros, disponible, prioritairesNonFactures, ignores };
}
