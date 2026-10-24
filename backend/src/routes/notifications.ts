import { Router, type Response } from "express";
import { prisma } from "../lib/prisma";
import { seuilAlerte } from "../lib/statutStock";
import { situationsSociete } from "../services/creditService";
import { ciblesDeLaSociete, requireAdmin, requireAuth, requireSociete } from "../middleware/auth";

// Centre de notifications de l'admin : ce qui demande de l'attention, jour par jour.
// Les évènements sont déduits des données (rien n'est stocké) : chacun porte la date à laquelle il est
// apparu (nouvel article, dernier mouvement avant la rupture, date d'expiration, bon impayé depuis 30 jours…).
export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, requireAdmin, requireSociete, ciblesDeLaSociete);

export type NiveauNotif = "danger" | "warning" | "info";
export type TypeNotif = "RUPTURE" | "STOCK_BAS" | "EXPIRE" | "EXPIRE_BIENTOT" | "CREDIT_RETARD" | "NOUVEL_ARTICLE" | "NOUVEAUX_ARTICLES" | "A_COMPLETER";

export interface Notif {
  id: string;
  type: TypeNotif;
  niveau: NiveauNotif;
  /** ISO : quand l'évènement est apparu. */
  date: string;
  titre: string;
  detail: string;
  /** Valeurs du message (l'app les met en forme dans la langue de l'utilisateur). */
  params: { nom?: string; q?: number; jours?: number; n?: number; total?: number };
  /** Écran à ouvrir. */
  lien: { ecran: "article" | "peremptions" | "credits" | "articles-a-completer" | "articles"; id?: string };
}

const JOUR = 86_400_000;
const FENETRE_JOURS = 45;
const MAX = 250;
const GROUPE_A_PARTIR_DE = 8;
const ALERTE_PAR_DEFAUT = 30;
const SEUIL_CREDIT_JOURS = 30;

const fmt = (n: number) => (Math.round(n * 1000) / 1000).toFixed(3);
const jourDe = (d: Date) => d.toISOString().slice(0, 10);

notificationsRouter.get("/", async (req, res: Response) => {
  try {
    const societeId = req.societeId!;
    const maintenant = new Date();
    const depuis = new Date(maintenant.getTime() - FENETRE_JOURS * JOUR);
    const evenements: Notif[] = [];

    // ------------------------------------------------------------ stock : rupture / stock bas
    const [stocks, derniers] = await Promise.all([
      prisma.stockDepot.findMany({
        where: { article: { societeId, deletedAt: null } },
        select: { articleId: true, quantite: true, article: { select: { id: true, designation: true, colisage: true, stockMini: true } } },
      }),
      prisma.mouvementDepot.groupBy({ by: ["articleId"], where: { article: { societeId, deletedAt: null } }, _max: { date: true } }),
    ]);
    const dernierMouvement = new Map(derniers.map((d) => [d.articleId, d._max.date as Date]));
    for (const s of stocks) {
      const q = Number(s.quantite);
      const a = s.article;
      // Un article jamais mouvementé (catalogue importé) n'a pas de stock « manquant » : pas d'alerte.
      const date = dernierMouvement.get(a.id);
      if (!date) continue;
      if (q <= 1e-9) {
        evenements.push({
          id: `rupture:${a.id}`,
          type: "RUPTURE",
          niveau: "danger",
          date: date.toISOString(),
          titre: `${a.designation} : rupture de stock`,
          detail: "Plus aucune pièce au dépôt.",
          params: { nom: a.designation },
          lien: { ecran: "article", id: a.id },
        });
      } else if (q <= seuilAlerte({ colisage: a.colisage, stockMini: a.stockMini === null ? null : Number(a.stockMini) }) + 1e-9) {
        evenements.push({
          id: `bas:${a.id}`,
          type: "STOCK_BAS",
          niveau: "warning",
          date: date.toISOString(),
          titre: `${a.designation} : stock bas`,
          detail: `${q} pièce${q > 1 ? "s" : ""} restante${q > 1 ? "s" : ""} au dépôt.`,
          params: { nom: a.designation, q },
          lien: { ecran: "article", id: a.id },
        });
      }
    }

    // ------------------------------------------------------------ dates d'expiration
    const cats = await prisma.categorie.findMany({ where: { societeId }, select: { id: true, parentId: true, perissable: true, alerteJours: true } });
    const parId = new Map(cats.map((c) => [c.id, c]));
    const regle = (categorieId: string | null) => {
      const c = categorieId ? parId.get(categorieId) : undefined;
      const parent = c?.parentId ? parId.get(c.parentId) : undefined;
      const source = c?.perissable ? c : parent?.perissable ? parent : undefined;
      return source ? c?.alerteJours ?? source.alerteJours ?? parent?.alerteJours ?? ALERTE_PAR_DEFAUT : null;
    };
    const lots = await prisma.lotDepot.findMany({
      where: { quantite: { gt: 0 }, dateExpiration: { not: null }, article: { societeId, deletedAt: null, sansPeremption: false } },
      select: { id: true, articleId: true, dateExpiration: true, quantite: true, article: { select: { designation: true, categorieId: true } } },
    });
    const aujourdhui = Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), maintenant.getUTCDate());
    for (const l of lots) {
      const alerte = regle(l.article.categorieId);
      if (alerte === null || !l.dateExpiration) continue;
      const exp = l.dateExpiration.getTime();
      const jours = Math.round((exp - aujourdhui) / JOUR);
      const q = Number(l.quantite);
      if (jours < 0) {
        evenements.push({
          id: `expire:${l.id}`,
          type: "EXPIRE",
          niveau: "danger",
          date: new Date(exp).toISOString(),
          titre: `${l.article.designation} : lot expiré`,
          detail: `${q} pièce${q > 1 ? "s" : ""} expirée${q > 1 ? "s" : ""} depuis ${-jours} jour${-jours > 1 ? "s" : ""}.`,
          params: { nom: l.article.designation, q, jours: -jours },
          lien: { ecran: "peremptions" },
        });
      } else if (jours <= alerte) {
        // L'alerte apparaît « alerte » jours avant l'expiration.
        const apparu = Math.max(exp - alerte * JOUR, depuis.getTime());
        evenements.push({
          id: `bientot:${l.id}`,
          type: "EXPIRE_BIENTOT",
          niveau: "warning",
          date: new Date(Math.min(apparu, maintenant.getTime())).toISOString(),
          titre: `${l.article.designation} : expire ${jours === 0 ? "aujourd'hui" : `dans ${jours} jour${jours > 1 ? "s" : ""}`}`,
          detail: `${q} pièce${q > 1 ? "s" : ""} à vérifier.`,
          params: { nom: l.article.designation, q, jours },
          lien: { ecran: "peremptions" },
        });
      }
    }

    // ------------------------------------------------------------ crédits en retard
    const situations = await situationsSociete(societeId);
    const idsClients = [...situations.keys()];
    const clients = await prisma.client.findMany({ where: { id: { in: idsClients }, societeId }, select: { id: true, nomCommerce: true } });
    const nomClient = new Map(clients.map((c) => [c.id, c.nomCommerce]));
    for (const [clientId, sit] of situations) {
      const nom = nomClient.get(clientId);
      if (!nom) continue;
      const enRetard = sit.factures.filter((f) => maintenant.getTime() - f.date.getTime() > SEUIL_CREDIT_JOURS * JOUR);
      if (enRetard.length === 0) continue;
      const total = enRetard.reduce((s, f) => s + f.reste, 0);
      // Le retard commence 30 jours après le plus ancien bon impayé.
      const plusAncien = enRetard.reduce((m, f) => Math.min(m, f.date.getTime()), Infinity);
      evenements.push({
        id: `credit:${clientId}`,
        type: "CREDIT_RETARD",
        niveau: "warning",
        date: new Date(plusAncien + SEUIL_CREDIT_JOURS * JOUR).toISOString(),
        titre: `${nom} : crédit en retard`,
        detail: `${enRetard.length} bon${enRetard.length > 1 ? "s" : ""} impayé${enRetard.length > 1 ? "s" : ""} depuis plus de ${SEUIL_CREDIT_JOURS} jours, soit ${fmt(total)} TND.`,
        params: { nom, n: enRetard.length, total: Math.round(total * 1000) / 1000 },
        lien: { ecran: "credits" },
      });
    }

    // ------------------------------------------------------------ nouveaux articles
    const nouveaux = await prisma.article.findMany({
      where: { societeId, deletedAt: null, createdAt: { gte: depuis } },
      select: { id: true, designation: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    const parJour = new Map<string, typeof nouveaux>();
    for (const a of nouveaux) parJour.set(jourDe(a.createdAt), [...(parJour.get(jourDe(a.createdAt)) ?? []), a]);
    for (const [jour, liste] of parJour) {
      // Un import en masse devient un seul évènement.
      if (liste.length >= GROUPE_A_PARTIR_DE) {
        evenements.push({
          id: `nouveaux:${jour}`,
          type: "NOUVEAUX_ARTICLES",
          niveau: "info",
          date: liste[0].createdAt.toISOString(),
          titre: `${liste.length} nouveaux articles ajoutés`,
          detail: "Import ou création en série dans le catalogue.",
          params: { n: liste.length },
          lien: { ecran: "articles" },
        });
      } else {
        for (const a of liste) {
          evenements.push({
            id: `nouvel:${a.id}`,
            type: "NOUVEL_ARTICLE",
            niveau: "info",
            date: a.createdAt.toISOString(),
            titre: `Nouvel article : ${a.designation}`,
            detail: "Ajouté au catalogue.",
            params: { nom: a.designation },
            lien: { ecran: "article", id: a.id },
          });
        }
      }
    }

    // ------------------------------------------------------------ articles en stock sans prix d'achat
    const sansPrix = await prisma.article.count({
      where: { societeId, deletedAt: null, prixAchat: { lte: 0 }, stockDepot: { is: { quantite: { gt: 0 } } } },
    });
    if (sansPrix > 0) {
      evenements.push({
        id: `a-completer:${jourDe(maintenant)}`,
        type: "A_COMPLETER",
        niveau: "info",
        date: maintenant.toISOString(),
        titre: `${sansPrix} article${sansPrix > 1 ? "s" : ""} en stock sans prix d'achat`,
        detail: "La valeur du dépôt et la marge ne peuvent pas être calculées.",
        params: { n: sansPrix },
        lien: { ecran: "articles-a-completer" },
      });
    }

    evenements.sort((a, b) => b.date.localeCompare(a.date));
    res.json({ genereLe: maintenant.toISOString(), evenements: evenements.slice(0, MAX), total: evenements.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
});
