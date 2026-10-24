import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { synchroniserLots } from "../lib/lotsDepot";
import { arrondir } from "../lib/tarifs";

// Caisse du supermarché : réception des données envoyées par l'application de caisse (qui travaille hors
// ligne). Tout est idempotent : chaque session, ticket et mouvement porte l'identifiant créé par la caisse,
// un envoi répété (connexion coupée pendant la réponse) ne crée rien en double.

const r3 = (n: number) => arrondir(n, 3);
const montant = z.number().min(0).max(10_000_000);

export const DROITS_CAISSIER = ["remise", "annulerLigne", "annulerTicket", "retour", "prelevement", "rapportX", "cloture", "tiroir"] as const;
export type DroitCaissier = (typeof DROITS_CAISSIER)[number];
export const droitsSchema = z.object(Object.fromEntries(DROITS_CAISSIER.map((d) => [d, z.boolean()])) as Record<DroitCaissier, z.ZodBoolean>);

const sessionSchema = z.object({
  id: z.string().uuid(),
  caissierId: z.string().uuid(),
  ouverteLe: z.string().datetime({ offset: true }),
  fondCaisse: montant,
  clotureeLe: z.string().datetime({ offset: true }).nullable().optional(),
  numeroZ: z.number().int().min(1).nullable().optional(),
  especesComptees: montant.nullable().optional(),
});

const ticketSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  caissierId: z.string().uuid(),
  numero: z.number().int().min(1),
  date: z.string().datetime({ offset: true }),
  type: z.enum(["VENTE", "RETOUR"]),
  remise: montant.default(0),
  rendu: montant.default(0),
  lignes: z
    .array(
      z.object({
        articleId: z.string().uuid(),
        // 0 pièce payée : article offert par une promotion (seulement des pièces offertes).
        quantite: z.number().min(0).max(100_000),
        prixUnitaire: montant,
        remise: montant.default(0),
        quantiteOfferte: z.number().min(0).max(100_000).default(0),
        promotionId: z.string().uuid().nullable().optional(),
      }).refine((l) => l.quantite + l.quantiteOfferte > 0, "Ligne sans quantité"),
    )
    .min(1)
    .max(500),
  paiements: z
    .array(
      z.object({
        mode: z.enum(["ESPECES", "TPE", "CHEQUE", "TICKET_RESTO", "BON_ACHAT"]),
        montant,
        reference: z.string().trim().max(60).nullable().optional(),
      }),
    )
    .max(20),
});

const mouvementSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: z.enum(["PRELEVEMENT", "APPORT"]),
  montant: montant.refine((m) => m > 0),
  motif: z.string().trim().max(160).nullable().optional(),
  date: z.string().datetime({ offset: true }),
});

export const syncSchema = z.object({
  sessions: z.array(sessionSchema).max(200).default([]),
  tickets: z.array(ticketSchema).max(500).default([]),
  mouvements: z.array(mouvementSchema).max(500).default([]),
});
export type SyncCaisse = z.infer<typeof syncSchema>;
type TicketEntrant = z.infer<typeof ticketSchema>;

interface CaisseAuth {
  id: string;
  societeId: string;
  numero: number;
}

/** Enregistre un ticket et fait bouger le stock du dépôt (vente : sortie, retour : entrée). */
async function enregistrerTicket(caisse: CaisseAuth, t: TicketEntrant, tauxResto: number): Promise<{ numero: number }> {
  return prisma.$transaction(async (tx) => {
    const articles = await tx.article.findMany({
      where: { id: { in: [...new Set(t.lignes.map((l) => l.articleId))] }, societeId: caisse.societeId },
      select: { id: true, tva: true, fodec: true },
    });
    const parId = new Map(articles.map((a) => [a.id, a]));
    if (parId.size !== new Set(t.lignes.map((l) => l.articleId)).size) throw new ErreurCaisse("Article inconnu dans le ticket");

    // Montants recalculés ici à partir des lignes : TTC = quantité × prix − remise ; HT en retirant TVA et FODEC.
    const lignes = t.lignes.map((l, ordre) => {
      const a = parId.get(l.articleId)!;
      const tva = Number(a.tva);
      const fodec = Number(a.fodec);
      const ttc = r3(Math.max(0, l.quantite * l.prixUnitaire - l.remise));
      return { ...l, ordre, tauxTva: tva, montantTTC: ttc, montantHT: arrondir(ttc / ((1 + fodec / 100) * (1 + tva / 100)), 3) };
    });
    const brutTTC = r3(lignes.reduce((s, l) => s + l.montantTTC, 0));
    const remise = Math.min(t.remise, brutTTC);
    const ttc = r3(brutTTC - remise);
    // Remise du ticket répartie au prorata sur l'HT. La « TVA » du ticket comprend aussi le FODEC éventuel.
    const ht = brutTTC > 0 ? r3(lignes.reduce((s, l) => s + l.montantHT, 0) * (ttc / brutTTC)) : 0;

    // Numéro déjà pris par un autre ticket (caisse réinstallée…) : on prend le suivant, la caisse est prévenue.
    let numero = t.numero;
    const pris = await tx.ticketCaisse.findUnique({ where: { caisseId_numero: { caisseId: caisse.id, numero } }, select: { id: true } });
    if (pris) {
      const max = await tx.ticketCaisse.aggregate({ where: { caisseId: caisse.id }, _max: { numero: true } });
      numero = (max._max.numero ?? 0) + 1;
    }

    await tx.ticketCaisse.create({
      data: {
        id: t.id,
        societeId: caisse.societeId,
        caisseId: caisse.id,
        sessionId: t.sessionId,
        caissierId: t.caissierId,
        numero,
        date: new Date(t.date),
        type: t.type,
        montantHT: ht,
        montantTVA: r3(ttc - ht),
        montantTTC: ttc,
        remise,
        rendu: t.rendu,
        lignes: {
          create: lignes.map((l) => ({
            articleId: l.articleId,
            quantite: l.quantite,
            prixUnitaire: l.prixUnitaire,
            tauxTva: l.tauxTva,
            remise: l.remise,
            montantTTC: l.montantTTC,
            montantHT: l.montantHT,
            quantiteOfferte: l.quantiteOfferte,
            promotionId: l.promotionId ?? null,
            ordre: l.ordre,
          })),
        },
        paiements: {
          create: t.paiements.map((p) => ({
            mode: p.mode,
            montant: p.montant,
            reference: p.reference || null,
            // Ticket restaurant : l'émetteur rembourse le magasin moins sa commission (bons d'achat : aucune).
            commission: p.mode === "TICKET_RESTO" ? r3((p.montant * tauxResto) / 100) : 0,
          })),
        },
      },
    });

    // Stock du dépôt : pièces payées + offertes, par article.
    const signe = t.type === "VENTE" ? -1 : 1;
    const parArticle = new Map<string, number>();
    for (const l of lignes) parArticle.set(l.articleId, (parArticle.get(l.articleId) ?? 0) + l.quantite + l.quantiteOfferte);
    const reference = `Ticket C${caisse.numero}-${numero}`;
    for (const [articleId, q] of parArticle) {
      const pieces = r3(q);
      await tx.stockDepot.upsert({
        where: { articleId },
        create: { articleId, quantite: signe * pieces },
        update: { quantite: { increment: signe * pieces } },
      });
      await tx.mouvementDepot.create({
        data: { articleId, sens: t.type === "VENTE" ? "VENTE_CAISSE" : "RETOUR_CAISSE", quantite: signe * pieces, reference, date: new Date(t.date) },
      });
      await synchroniserLots(tx, articleId);
    }
    return { numero };
  });
}

export class ErreurCaisse extends Error {}

/**
 * Données envoyées par une caisse : sessions ouvertes, tickets, prélèvements / apports, puis clôtures.
 * Renvoie les identifiants enregistrés (ou déjà présents) pour que la caisse les marque comme envoyés.
 */
export async function synchroniserCaisse(caisse: CaisseAuth, data: SyncCaisse) {
  const societe = await prisma.societe.findUnique({ where: { id: caisse.societeId }, select: { commissionTicketResto: true } });
  const tauxResto = Number(societe?.commissionTicketResto ?? 0);
  const caissiers = new Set(
    (await prisma.caissier.findMany({ where: { societeId: caisse.societeId }, select: { id: true } })).map((c) => c.id),
  );
  const resultat = {
    sessions: [] as string[],
    tickets: [] as string[],
    mouvements: [] as string[],
    renumerotes: [] as { id: string; numero: number }[],
    erreurs: [] as { id: string; erreur: string }[],
  };

  // 1. Sessions (création seulement : la clôture est appliquée après les tickets).
  const sessionsCaisse = new Set<string>();
  for (const s of data.sessions) {
    const existante = await prisma.sessionCaisse.findUnique({ where: { id: s.id }, select: { caisseId: true } });
    if (existante && existante.caisseId !== caisse.id) {
      resultat.erreurs.push({ id: s.id, erreur: "Session d'une autre caisse" });
      continue;
    }
    if (!caissiers.has(s.caissierId)) {
      resultat.erreurs.push({ id: s.id, erreur: "Caissier inconnu" });
      continue;
    }
    if (!existante) {
      await prisma.sessionCaisse.create({
        data: { id: s.id, societeId: caisse.societeId, caisseId: caisse.id, caissierId: s.caissierId, ouverteLe: new Date(s.ouverteLe), fondCaisse: s.fondCaisse },
      });
    }
    sessionsCaisse.add(s.id);
  }
  // Sessions déjà connues (tickets envoyés plus tard que leur session).
  const autres = [...new Set([...data.tickets.map((t) => t.sessionId), ...data.mouvements.map((m) => m.sessionId)])].filter((id) => !sessionsCaisse.has(id));
  if (autres.length) {
    for (const s of await prisma.sessionCaisse.findMany({ where: { id: { in: autres }, caisseId: caisse.id }, select: { id: true } })) sessionsCaisse.add(s.id);
  }

  // 2. Tickets.
  const dejaLa = new Set(
    (await prisma.ticketCaisse.findMany({ where: { id: { in: data.tickets.map((t) => t.id) } }, select: { id: true } })).map((t) => t.id),
  );
  for (const t of data.tickets) {
    if (dejaLa.has(t.id)) {
      resultat.tickets.push(t.id);
      continue;
    }
    if (!sessionsCaisse.has(t.sessionId) || !caissiers.has(t.caissierId)) {
      resultat.erreurs.push({ id: t.id, erreur: "Session ou caissier inconnu" });
      continue;
    }
    try {
      const { numero } = await enregistrerTicket(caisse, t, tauxResto);
      resultat.tickets.push(t.id);
      if (numero !== t.numero) resultat.renumerotes.push({ id: t.id, numero });
    } catch (err) {
      // Même ticket reçu deux fois en même temps : déjà enregistré par l'autre envoi.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") resultat.tickets.push(t.id);
      else {
        if (!(err instanceof ErreurCaisse)) console.error(err);
        resultat.erreurs.push({ id: t.id, erreur: err instanceof ErreurCaisse ? err.message : "Ticket refusé" });
      }
    }
  }

  // 3. Prélèvements et apports.
  for (const m of data.mouvements) {
    if (!sessionsCaisse.has(m.sessionId)) {
      resultat.erreurs.push({ id: m.id, erreur: "Session inconnue" });
      continue;
    }
    await prisma.mouvementCaisse.upsert({
      where: { id: m.id },
      create: { id: m.id, sessionId: m.sessionId, type: m.type, montant: m.montant, motif: m.motif || null, date: new Date(m.date) },
      update: {},
    });
    resultat.mouvements.push(m.id);
  }

  // 4. Clôtures (Z).
  for (const s of data.sessions) {
    if (!sessionsCaisse.has(s.id)) continue;
    if (s.clotureeLe) {
      await prisma.sessionCaisse.updateMany({
        where: { id: s.id, statut: "OUVERTE" },
        data: { statut: "CLOTUREE", clotureeLe: new Date(s.clotureeLe), numeroZ: s.numeroZ ?? null, especesComptees: s.especesComptees ?? null },
      });
    }
    resultat.sessions.push(s.id);
  }

  await prisma.caisse.update({ where: { id: caisse.id }, data: { derniereSyncLe: new Date() } });
  return resultat;
}

/** Totaux d'une session : ventes, retours, par mode de règlement, espèces attendues dans le tiroir. */
export async function totauxSessions(sessionIds: string[], periode?: { du: Date; fin: Date }) {
  const date = periode ? { gte: periode.du, lt: periode.fin } : undefined;
  if (sessionIds.length === 0) return new Map<string, TotauxSession>();
  const tickets = await prisma.ticketCaisse.findMany({
    where: { sessionId: { in: sessionIds }, date },
    select: { sessionId: true, type: true, montantTTC: true, remise: true, rendu: true, paiements: { select: { mode: true, montant: true, commission: true } } },
  });
  const mouvements = await prisma.mouvementCaisse.findMany({ where: { sessionId: { in: sessionIds }, date }, select: { sessionId: true, type: true, montant: true } });
  const out = new Map<string, TotauxSession>();
  const de = (id: string) => {
    let t = out.get(id);
    if (!t) out.set(id, (t = { nbTickets: 0, nbRetours: 0, ventes: 0, retours: 0, remises: 0, parMode: {}, commissionResto: 0, prelevements: 0, apports: 0, especesNettes: 0 }));
    return t;
  };
  for (const tk of tickets) {
    const t = de(tk.sessionId);
    const vente = tk.type === "VENTE";
    const signe = vente ? 1 : -1;
    if (vente) {
      t.nbTickets++;
      t.ventes = r3(t.ventes + Number(tk.montantTTC));
      t.remises = r3(t.remises + Number(tk.remise));
    } else {
      t.nbRetours++;
      t.retours = r3(t.retours + Number(tk.montantTTC));
    }
    for (const p of tk.paiements) {
      t.parMode[p.mode] = r3((t.parMode[p.mode] ?? 0) + signe * Number(p.montant));
      if (Number(p.commission)) t.commissionResto = r3(t.commissionResto + signe * Number(p.commission));
    }
    // La monnaie rendue sort du tiroir.
    if (Number(tk.rendu)) t.parMode.ESPECES = r3((t.parMode.ESPECES ?? 0) - signe * Number(tk.rendu));
  }
  for (const m of mouvements) {
    const t = de(m.sessionId);
    if (m.type === "PRELEVEMENT") t.prelevements = r3(t.prelevements + Number(m.montant));
    else t.apports = r3(t.apports + Number(m.montant));
  }
  for (const t of out.values()) t.especesNettes = r3((t.parMode.ESPECES ?? 0) - t.prelevements + t.apports);
  return out;
}

export interface TotauxSession {
  nbTickets: number;
  nbRetours: number;
  /** Ventes TTC (après remises). */
  ventes: number;
  retours: number;
  remises: number;
  /** Encaissé par mode (retours déduits, monnaie rendue déduite des espèces). */
  parMode: Partial<Record<"ESPECES" | "TPE" | "CHEQUE" | "TICKET_RESTO" | "BON_ACHAT", number>>;
  /** Commission des émetteurs de tickets restaurant (à déduire de leur valeur faciale). */
  commissionResto: number;
  prelevements: number;
  apports: number;
  /** Espèces nettes de la session (hors fond de caisse). */
  especesNettes: number;
}
