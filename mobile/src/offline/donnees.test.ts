import { beforeEach, describe, expect, it, vi } from "vitest";

// Plugins natifs absents des tests : réseau « connecté », pas d'écouteurs.
vi.mock("@capacitor/network", () => ({
  Network: { getStatus: async () => ({ connected: true }), addListener: async () => ({ remove: async () => undefined }) },
}));
vi.mock("@capacitor/app", () => ({ App: { addListener: async () => ({ remove: async () => undefined }) } }));

import { definirSession } from "./stockage";
import { ecrireCache } from "./cache";
import { lireFile, oublierFileEnMemoire } from "./file";
import { synchroniser } from "./sync";
import { ajouterAvance, createClient, createFacture, listClients, listCredits, listFactures, payerFacture } from "./donnees";
import type { Article } from "../types/article";
import type { Client } from "../types/client";

const article = { id: "a1", code: "010001", designation: "CIRE", prixVente: 10, tauxTva: 19, colisage: 6 } as unknown as Article;
const ancien: Client = {
  id: "c1", code: "CLI001", nomCommerce: "Superette", actif: true, solde: 0,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

/** Réseau coupé : fetch échoue comme sur le terrain sans signal. */
const sansReseau = () => vi.fn(async () => { throw new TypeError("Failed to fetch"); });

beforeEach(async () => {
  localStorage.clear();
  definirSession({ id: "v1", code: "V001", nom: "Ahmed", role: "VENDEUR" });
  oublierFileEnMemoire();
  await ecrireCache("articles", [article]);
  await ecrireCache("clients", [ancien]);
  await ecrireCache("credits", []);
  await ecrireCache("factures", []);
});

describe("vendeur hors ligne", () => {
  it("garde client, facture à crédit et encaissements, puis les envoie dans l'ordre", async () => {
    globalThis.fetch = sansReseau() as unknown as typeof fetch;

    const client = await createClient({ code: "NV-1", nomCommerce: "Nouveau commerce" });
    expect((await listClients()).find((c) => c.id === client.id)?.enAttente).toBe(true);
    await expect(createClient({ code: "nv-1", nomCommerce: "Doublon" })).rejects.toThrow(/matricule/);

    const facture = await createFacture({
      clientId: client.id,
      typeVente: "CREDIT",
      lignes: [{ articleId: "a1", quantite: 2, prixUnitaire: 10, tauxTva: 19 }],
    });
    expect(facture.numero).toMatch(/^V001-\d{2}-0001$/);
    expect(facture.montantTTC).toBe(23.8);
    expect(facture.lignes[0].article.designation).toBe("CIRE");

    let credits = await listCredits();
    expect(credits).toHaveLength(1);
    expect(credits[0].totalDu).toBe(23.8);

    await ajouterAvance(client.id, 10, { mode: "ESPECES" });
    credits = await listCredits();
    expect(credits[0].totalDu).toBe(13.8);
    expect((await listClients()).find((c) => c.id === client.id)?.solde).toBe(13.8);
    await expect(ajouterAvance(client.id, 50, { mode: "ESPECES" })).rejects.toThrow(/ne doit que/);

    await payerFacture(facture.id, { mode: "CHEQUE", reference: "123" });
    expect(await listCredits()).toHaveLength(0);
    const [enListe] = await listFactures();
    expect(enListe).toMatchObject({ id: facture.id, enAttente: true, reglement: { reste: 0 } });

    // Sans réseau, la synchronisation s'arrête sans rien perdre.
    expect((await synchroniser()).injoignable).toBe(true);
    expect(await lireFile()).toHaveLength(4);

    // Retour du réseau : tout part dans l'ordre de saisie, avec les ids du téléphone.
    const appels: Array<{ methode: string; url: string; corps: Record<string, unknown> | null }> = [];
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      const methode = init?.method ?? "GET";
      appels.push({ methode, url, corps: init?.body ? JSON.parse(String(init.body)) : null });
      const json = url.endsWith("/numero-suivant") ? { numero: "V001-26-0001" } : methode === "GET" ? [] : {};
      return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
    }) as unknown as typeof fetch;

    const r = await synchroniser();
    expect(r).toMatchObject({ envoyees: 4, refusees: 0, injoignable: false });
    expect(await lireFile()).toHaveLength(0);
    const envois = appels.filter((a) => a.methode !== "GET");
    expect(envois.map((a) => `${a.methode} ${a.url.replace(/^.*\/api/, "")}`)).toEqual([
      "POST /clients",
      "POST /factures",
      "POST /credits/avance",
      `POST /credits/factures/${facture.id}/payer`,
    ]);
    expect(envois[0].corps?.id).toBe(client.id);
    expect(envois[1].corps).toMatchObject({ id: facture.id, numero: facture.numero, clientId: client.id });
    expect(envois[2].corps).toMatchObject({ clientId: client.id, montant: 10, mode: "ESPECES" });
    expect(envois[3].corps).toMatchObject({ mode: "CHEQUE", reference: "123" });
    expect(typeof envois[3].corps?.date).toBe("string"); // daté de la saisie, pas de l'envoi
  });

  it("note un refus du serveur sur l'action et continue avec les suivantes", async () => {
    globalThis.fetch = sansReseau() as unknown as typeof fetch;
    await createClient({ code: "NV-2", nomCommerce: "Refusé" });
    await createClient({ code: "NV-3", nomCommerce: "Accepté" });
    await synchroniser();

    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const corps = init?.body ? JSON.parse(String(init.body)) : null;
      if (corps?.code === "NV-2") {
        return new Response(JSON.stringify({ error: "Ce matricule fiscal est déjà utilisé par un autre client" }), { status: 409 });
      }
      return new Response(JSON.stringify(init?.method === "POST" ? {} : []), { status: 200 });
    }) as unknown as typeof fetch;

    const r = await synchroniser();
    expect(r).toMatchObject({ envoyees: 1, refusees: 1 });
    const file = await lireFile();
    expect(file).toHaveLength(1);
    expect(file[0].erreur).toMatch(/matricule/);
  });

  it("numérote les factures à la suite, sans revenir en arrière", async () => {
    globalThis.fetch = sansReseau() as unknown as typeof fetch;
    const f1 = await createFacture({ clientId: "c1", typeVente: "COMPTANT", modePaiement: "ESPECES", lignes: [{ articleId: "a1", quantite: 1, prixUnitaire: 10, tauxTva: 19 }] });
    const f2 = await createFacture({ clientId: "c1", typeVente: "COMPTANT", modePaiement: "ESPECES", lignes: [{ articleId: "a1", quantite: 1, prixUnitaire: 10, tauxTva: 19 }] });
    expect(f1.numero.slice(-4)).toBe("0001");
    expect(f2.numero.slice(-4)).toBe("0002");
  });
});
