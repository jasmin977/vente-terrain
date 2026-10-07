// Accès aux données pour les écrans partagés admin / vendeur.
// - Admin : appels directs au serveur, comme avant.
// - Vendeur : chaque action est d'abord enregistrée sur le téléphone (file
//   d'attente) puis envoyée dès que possible ; les lectures reprennent les
//   dernières données du serveur (en direct si le réseau répond, sinon le cache)
//   avec les actions en attente appliquées par-dessus.
import * as articlesApi from "../api/articles";
import * as clientsApi from "../api/clients";
import * as creditsApi from "../api/credits";
import * as facturesApi from "../api/factures";
import { ApiError, apiRequest, estErreurReseau } from "../api/client";
import type { Article } from "../types/article";
import type { Client, ClientInput } from "../types/client";
import type { CreditClient, EncaissementCredit, EncaissementInput, FactureCredit, SituationCreditClient } from "../types/credit";
import type { Facture, FactureInput, LigneFacture } from "../types/facture";
import { articleCorrespond } from "../utils/articleSearch";
import { t } from "../i18n";
import { ecrireCache, lireCache, reserverNumero, type Caches } from "./cache";
import { ajouter, lireFile, type ActionEnAttente } from "./file";
import { getSession, modeHorsLigne } from "./stockage";
import { declencherSync, estEnLigne } from "./sync";

const EPS = 0.0005;
const DELAI_LECTURE = 8_000;
const arrondi = (n: number) => Math.round(n * 1000) / 1000;

/** Données fraîches si le serveur répond, sinon la dernière copie reçue. */
async function frais<K extends keyof Caches>(nom: K, chemin: string): Promise<Caches[K]> {
  if (estEnLigne()) {
    try {
      const valeur = await apiRequest<Caches[K]>(chemin, { timeoutMs: DELAI_LECTURE });
      await ecrireCache(nom, valeur);
      return valeur;
    } catch (err) {
      if (!estErreurReseau(err)) throw err;
    }
  }
  return lireCache(nom);
}

function vendeurSession() {
  const u = getSession();
  if (!u) throw new ApiError(401, t("Session expirée"));
  return { id: u.id, nom: u.nom, code: u.code };
}

/* ---------------------------------------------------------------- Actions en attente appliquées */

function clientsAvecAttente(base: Client[], file: ActionEnAttente[]): Client[] {
  const parId = new Map(base.map((c) => [c.id, { ...c }]));
  for (const a of file) {
    if (a.type === "client.creer" && !parId.has(a.client.id)) {
      const maintenant = a.creeLe;
      parId.set(a.client.id, { ...a.client, actif: true, solde: 0, createdAt: maintenant, updatedAt: maintenant, enAttente: true });
    } else if (a.type === "client.modifier") {
      const c = parId.get(a.clientId);
      if (c) parId.set(a.clientId, { ...c, ...a.modifs, enAttente: true });
    } else if (a.type === "client.supprimer") {
      parId.delete(a.clientId);
    } else if (a.type === "facture.creer" && a.facture.typeVente === "CREDIT") {
      const c = parId.get(a.facture.clientId);
      if (c) c.solde = arrondi(Number(c.solde) + a.locale.montantTTC);
    } else if (a.type === "credit.payer" || a.type === "credit.avance") {
      const c = parId.get(a.clientId);
      if (c) c.solde = arrondi(Number(c.solde) - a.montant);
    }
  }
  return [...parId.values()].sort((a, b) => a.nomCommerce.localeCompare(b.nomCommerce));
}

function creditsAvecAttente(base: CreditClient[], clients: Client[], file: ActionEnAttente[]): CreditClient[] {
  const groupes = new Map(base.map((g) => [g.client.id, { ...g, factures: g.factures.map((f) => ({ ...f })) }]));
  const dejaConnue = (id: string) => [...groupes.values()].some((g) => g.factures.some((f) => f.id === id));

  for (const a of file) {
    if (a.type === "facture.creer" && a.facture.typeVente === "CREDIT" && !dejaConnue(a.facture.id)) {
      const c = clients.find((x) => x.id === a.facture.clientId);
      const g = groupes.get(a.facture.clientId) ?? {
        client: { id: a.facture.clientId, code: c?.code ?? "", nomCommerce: c?.nomCommerce ?? "", ville: c?.ville, telephone: c?.telephone },
        totalDu: 0,
        factures: [] as FactureCredit[],
      };
      g.factures.push({
        id: a.facture.id,
        numero: a.facture.numero,
        date: a.facture.date,
        vendeur: a.locale.vendeur ?? { id: a.locale.vendeurId, nom: "", code: "" },
        montantTTC: a.locale.montantTTC,
        paye: 0,
        reste: a.locale.montantTTC,
      });
      groupes.set(a.facture.clientId, g);
    } else if (a.type === "credit.payer") {
      for (const g of groupes.values()) {
        const f = g.factures.find((x) => x.id === a.factureId);
        if (f) {
          f.paye = arrondi(f.paye + f.reste);
          f.reste = 0;
        }
      }
    } else if (a.type === "credit.avance") {
      // Imputée aux factures les plus anciennes, comme sur le serveur.
      const g = groupes.get(a.clientId);
      let reste = a.montant;
      for (const f of [...(g?.factures ?? [])].sort((x, y) => x.date.localeCompare(y.date))) {
        if (reste <= EPS) break;
        const part = Math.min(reste, f.reste);
        f.reste = arrondi(f.reste - part);
        f.paye = arrondi(f.paye + part);
        reste = arrondi(reste - part);
      }
    }
  }

  return [...groupes.values()]
    .map((g) => {
      const factures = g.factures.filter((f) => f.reste > EPS).sort((x, y) => x.date.localeCompare(y.date));
      return { ...g, factures, totalDu: arrondi(factures.reduce((s, f) => s + f.reste, 0)) };
    })
    .filter((g) => g.totalDu > EPS)
    .sort((a, b) => b.totalDu - a.totalDu);
}

function facturesEnAttente(file: ActionEnAttente[]): Facture[] {
  return file
    .filter((a): a is Extract<ActionEnAttente, { type: "facture.creer" }> => a.type === "facture.creer")
    .map((a) => ({ ...a.locale, enAttente: true, erreurSync: a.erreur }));
}

/** Règlement affiché d'une facture à crédit dont le paiement attend d'être envoyé. */
function avecPaiementsEnAttente(f: Facture, file: ActionEnAttente[]): Facture {
  const payee = file.some((a) => a.type === "credit.payer" && a.factureId === f.id);
  return payee && f.typeVente === "CREDIT" ? { ...f, reglement: { paye: f.montantTTC, reste: 0 } } : f;
}

/* ---------------------------------------------------------------- Articles */

export async function listArticles(filtres: articlesApi.ArticleFilters = {}): Promise<Article[]> {
  if (!modeHorsLigne()) return articlesApi.listArticles(filtres);
  const articles = await frais("articles", "/articles");
  if (filtres.codeBarre) return articles.filter((a) => a.codeBarre === filtres.codeBarre || a.code === filtres.codeBarre);
  if (filtres.q) return articles.filter((a) => articleCorrespond(a, filtres.q!));
  return articles;
}

/* ---------------------------------------------------------------- Clients */

async function clientsVendeur(): Promise<Client[]> {
  const [base, file] = await Promise.all([frais("clients", "/clients"), lireFile()]);
  return clientsAvecAttente(base, file);
}

export async function listClients(q?: string): Promise<Client[]> {
  if (!modeHorsLigne()) return clientsApi.listClients(q);
  const clients = await clientsVendeur();
  const r = q?.trim().toLowerCase();
  if (!r) return clients;
  return clients.filter((c) => [c.code, c.nomCommerce, c.ville].some((v) => v?.toLowerCase().includes(r)));
}

export async function getClient(id: string): Promise<Client> {
  if (!modeHorsLigne()) return clientsApi.getClient(id);
  const c = (await clientsVendeur()).find((x) => x.id === id);
  if (c) return c;
  if (estEnLigne()) return clientsApi.getClient(id);
  throw new ApiError(404, t("Client introuvable"));
}

async function verifierCodeLibre(code: string, sauf?: string) {
  const pris = (await clientsVendeur()).some((c) => c.id !== sauf && c.code.trim().toLowerCase() === code.trim().toLowerCase());
  if (pris) throw new ApiError(409, t("Ce matricule fiscal est déjà utilisé par un autre client"));
}

export async function createClient(input: ClientInput): Promise<Client> {
  if (!modeHorsLigne()) return clientsApi.createClient(input);
  await verifierCodeLibre(input.code);
  const client = { ...input, id: crypto.randomUUID() };
  const a = await ajouter({ type: "client.creer", client });
  declencherSync();
  return { ...client, actif: true, solde: 0, createdAt: a.creeLe, updatedAt: a.creeLe, enAttente: true };
}

export async function updateClient(id: string, modifs: Partial<ClientInput>): Promise<Client> {
  if (!modeHorsLigne()) return clientsApi.updateClient(id, modifs);
  if (modifs.code) await verifierCodeLibre(modifs.code, id);
  await ajouter({ type: "client.modifier", clientId: id, modifs });
  declencherSync();
  return getClient(id);
}

export async function deleteClient(id: string): Promise<void> {
  if (!modeHorsLigne()) return clientsApi.deleteClient(id);
  await ajouter({ type: "client.supprimer", clientId: id });
  declencherSync();
}

/* ---------------------------------------------------------------- Crédits */

export async function listCredits(): Promise<CreditClient[]> {
  if (!modeHorsLigne()) return creditsApi.listCredits();
  const [base, clients, file] = await Promise.all([frais("credits", "/credits"), clientsVendeur(), lireFile()]);
  return creditsAvecAttente(base, clients, file);
}

export async function getCreditClient(clientId: string): Promise<SituationCreditClient> {
  if (!modeHorsLigne()) return creditsApi.getCreditClient(clientId);
  let enDirect: SituationCreditClient | null = null;
  if (estEnLigne()) {
    try {
      enDirect = await apiRequest<SituationCreditClient>(`/credits/clients/${clientId}`, { timeoutMs: DELAI_LECTURE });
    } catch (err) {
      if (!estErreurReseau(err)) throw err;
    }
  }
  const [clients, file] = await Promise.all([clientsVendeur(), lireFile()]);
  const base = enDirect ? [enDirect] : (await lireCache("credits")).filter((g) => g.client.id === clientId);
  const groupe = creditsAvecAttente(base, clients, file).find((g) => g.client.id === clientId);
  const c = clients.find((x) => x.id === clientId);
  const vendeur = vendeurSession();
  const enAttente: EncaissementCredit[] = file.flatMap((a) =>
    (a.type === "credit.payer" || a.type === "credit.avance") && a.clientId === clientId
      ? [
          {
            id: a.paiementId,
            montant: a.montant,
            mode: a.encaissement.mode,
            date: a.encaissement.date ?? a.creeLe,
            reference: a.encaissement.reference,
            facture: a.type === "credit.payer" ? { id: a.factureId, numero: a.numero } : null,
            vendeur,
          },
        ]
      : []
  );
  return {
    client: groupe?.client ?? enDirect?.client ?? { id: clientId, code: c?.code ?? "", nomCommerce: c?.nomCommerce ?? "", ville: c?.ville },
    totalDu: groupe?.totalDu ?? 0,
    factures: groupe?.factures ?? [],
    paiements: [...enAttente.reverse(), ...(enDirect?.paiements ?? [])],
  };
}

// Sans date choisie, l'encaissement est daté du moment de la saisie (et non de
// l'envoi, qui peut avoir lieu bien plus tard).
const dateSaisie = (input: EncaissementInput): EncaissementInput => ({ ...input, date: input.date ?? new Date().toISOString() });

export async function payerFacture(factureId: string, input: EncaissementInput): Promise<void> {
  if (!modeHorsLigne()) {
    await creditsApi.payerFacture(factureId, input);
    return;
  }
  const credits = await listCredits();
  const groupe = credits.find((g) => g.factures.some((f) => f.id === factureId));
  const facture = groupe?.factures.find((f) => f.id === factureId);
  if (!groupe || !facture) throw new ApiError(409, t("Cette facture est déjà payée"));
  await ajouter({
    type: "credit.payer",
    paiementId: crypto.randomUUID(),
    factureId,
    encaissement: dateSaisie(input),
    clientId: groupe.client.id,
    montant: facture.reste,
    numero: facture.numero,
  });
  declencherSync();
}

export async function ajouterAvance(clientId: string, montant: number, input: EncaissementInput): Promise<void> {
  if (!modeHorsLigne()) {
    await creditsApi.ajouterAvance(clientId, montant, input);
    return;
  }
  const du = (await listCredits()).find((g) => g.client.id === clientId)?.totalDu ?? 0;
  if (montant > du + EPS) throw new ApiError(409, t("Le client ne doit que {m} TND", { m: du.toFixed(3) }));
  await ajouter({ type: "credit.avance", paiementId: crypto.randomUUID(), clientId, montant, encaissement: dateSaisie(input) });
  declencherSync();
}

/* ---------------------------------------------------------------- Factures */

export async function listFactures(filtres: facturesApi.FactureFilters = {}): Promise<Facture[]> {
  if (!modeHorsLigne()) return facturesApi.listFactures(filtres);
  // Le serveur ne renvoie au vendeur que ses factures du jour.
  const [base, file] = await Promise.all([frais("factures", "/factures"), lireFile()]);
  const enAttente = facturesEnAttente(file);
  const ids = new Set(enAttente.map((f) => f.id));
  return [...enAttente, ...base.filter((f) => !ids.has(f.id))]
    .map((f) => avecPaiementsEnAttente(f, file))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getFacture(id: string): Promise<Facture> {
  if (!modeHorsLigne()) return facturesApi.getFacture(id);
  const file = await lireFile();
  const locale = facturesEnAttente(file).find((f) => f.id === id);
  if (locale) return locale;
  if (estEnLigne()) {
    try {
      return avecPaiementsEnAttente(await apiRequest<Facture>(`/factures/${id}`, { timeoutMs: DELAI_LECTURE }), file);
    } catch (err) {
      if (!estErreurReseau(err)) throw err;
    }
  }
  const enCache = (await lireCache("factures")).find((f) => f.id === id);
  if (enCache) return avecPaiementsEnAttente(enCache, file);
  throw new ApiError(404, t("Facture introuvable"));
}

/**
 * Vendeur : la facture est numérotée et enregistrée sur le téléphone (ticket
 * imprimable tout de suite), puis envoyée au serveur dès que possible.
 */
export async function createFacture(input: FactureInput): Promise<Facture> {
  if (!modeHorsLigne()) return facturesApi.createFacture(input);
  const vendeur = vendeurSession();
  const [articles, clients] = await Promise.all([lireCache("articles"), clientsVendeur()]);
  const client = clients.find((c) => c.id === input.clientId);
  if (!client) throw new ApiError(404, t("Client introuvable"));

  const lignes: LigneFacture[] = input.lignes.map((l) => {
    const article = articles.find((a) => a.id === l.articleId);
    if (!article) throw new ApiError(404, t("Article introuvable"));
    const ht = l.quantite * l.prixUnitaire;
    return { id: crypto.randomUUID(), ...l, montantHT: arrondi(ht), montantTTC: arrondi(ht * (1 + l.tauxTva / 100)), article };
  });
  const montantHT = arrondi(lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0));
  const montantTTC = arrondi(lignes.reduce((s, l) => s + l.quantite * l.prixUnitaire * (1 + l.tauxTva / 100), 0));

  const id = crypto.randomUUID();
  const numero = await reserverNumero(vendeur.code);
  const date = new Date().toISOString();
  const locale: Facture = {
    id,
    numero,
    clientId: client.id,
    vendeurId: vendeur.id,
    date,
    typeVente: input.typeVente,
    modePaiement: input.typeVente === "COMPTANT" ? input.modePaiement ?? null : null,
    montantHT,
    montantTVA: arrondi(montantTTC - montantHT),
    montantTTC,
    statut: "VALIDEE",
    reglement: input.typeVente === "CREDIT" ? { paye: 0, reste: montantTTC } : null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    lignes,
    client: { id: client.id, nomCommerce: client.nomCommerce, code: client.code, latitude: client.latitude, longitude: client.longitude },
    vendeur,
    enAttente: true,
  };
  await ajouter({ type: "facture.creer", facture: { ...input, id, numero, date }, locale });
  declencherSync();
  return locale;
}
