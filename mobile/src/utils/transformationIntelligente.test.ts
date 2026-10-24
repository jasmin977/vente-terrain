import { describe, expect, it } from "vitest";
import { aUnMf, joursDe, planifier, type BonPlan } from "./transformationIntelligente";

// Générateur déterministe : montants variés, 8 clients (les 2 derniers sans MF), dates sur trois mois.
function bons(): BonPlan[] {
  const liste: BonPlan[] = [];
  let seed = 7;
  const alea = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 300; i++) {
    const jour = 1 + Math.floor(alea() * 90);
    const d = new Date(Date.UTC(2026, 6, jour));
    const client = 1 + Math.floor(alea() * 8);
    liste.push({
      id: `b${i}`,
      numero: `26/${String(i + 1).padStart(4, "0")}`,
      clientId: `c${client}`,
      clientNom: `Client ${client}`,
      clientRef: client,
      mf: client <= 6,
      date: d.toISOString().slice(0, 10),
      total: Math.round((20 + alea() * 300) * 1000) / 1000,
    });
  }
  return liste;
}

const params = { debut: "2026-09-01", fin: "2026-09-30", cible: 8000, plafond: 1000, minimum: 0, prioritaires: new Set<string>() };

describe("aUnMf", () => {
  it("reconnaît un matricule fiscal", () => {
    expect(aUnMf("1884126/B/A/M/000")).toBe(true);
    expect(aUnMf("1234567A")).toBe(true);
    expect(aUnMf("CLI001")).toBe(false);
    expect(aUnMf("")).toBe(false);
  });
});

describe("planifier", () => {
  it("respecte la cible, le plafond, les dates et un seul client par facture", () => {
    const r = planifier(bons(), params);
    expect(r.factures.length).toBeGreaterThan(0);
    expect(r.total).toBeLessThanOrEqual(8000);
    expect(r.ecart).toBeGreaterThanOrEqual(0);
    expect(r.ecart).toBeLessThan(150);
    const vus = new Set<string>();
    for (const f of r.factures) {
      expect(f.total).toBeLessThanOrEqual(1000);
      expect(f.date >= "2026-09-01" && f.date <= "2026-09-30").toBe(true);
      expect(f.bons.every((b) => b.clientId === f.clientId && b.date <= f.date)).toBe(true);
      for (const b of f.bons) {
        expect(vus.has(b.id)).toBe(false);
        vus.add(b.id);
      }
    }
  });

  it("un client n'a qu'une facture par jour", () => {
    const r = planifier(bons(), { ...params, prioritaires: new Set(["c1", "c2", "c3"]) });
    const cles = r.factures.map((f) => `${f.date}|${f.clientId}`);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("facture tous les BL des clients prioritaires en un minimum de factures", () => {
    const base = bons();
    const r = planifier(base, { ...params, cible: 100000, prioritaires: new Set(["c1", "c2"]) });
    expect(r.prioritairesNonFactures).toEqual([]);
    for (const c of ["c1", "c2"]) {
      const siens = base.filter((b) => b.clientId === c && b.date <= "2026-09-30");
      const factures = r.factures.filter((f) => f.clientId === c);
      expect(factures.flatMap((f) => f.bons).length).toBe(siens.length);
      const somme = siens.reduce((s, b) => s + b.total, 0);
      // Pas plus d'une facture de trop par rapport au minimum théorique.
      expect(factures.length).toBeLessThanOrEqual(Math.ceil(somme / 1000) + 1);
      expect(factures.every((f) => f.total <= 1000)).toBe(true);
    }
    expect(r.total).toBeLessThanOrEqual(100000);
  });

  it("ne dépasse pas le total même pour les clients prioritaires et signale ce qui reste", () => {
    const r = planifier(bons(), { ...params, cible: 2500, prioritaires: new Set(["c1", "c2"]) });
    expect(r.total).toBeLessThanOrEqual(2500);
    expect(r.prioritairesNonFactures.length).toBeGreaterThan(0);
  });

  it("choisit d'abord les clients avec un MF", () => {
    const r = planifier(bons(), { ...params, cible: 1500 });
    expect(r.factures.length).toBeGreaterThan(0);
    expect(r.factures.every((f) => f.mf)).toBe(true);
  });

  it("facture seul un BL plus gros que le plafond et le signale", () => {
    const base = bons();
    base.push({ id: "gros", numero: "26/9999", clientId: "c1", clientNom: "Client 1", clientRef: 1, mf: true, date: "2026-08-01", total: 1500 });
    const r = planifier(base, { ...params, cible: 100000 });
    expect(r.tropGros.map((b) => b.id)).toEqual(["gros"]);
    const f = r.factures.find((x) => x.bons.some((b) => b.id === "gros"))!;
    expect(f.bons).toHaveLength(1);
    expect(f.total).toBe(1500);
  });

  it("ignore les lots sous le minimum par facture", () => {
    const r = planifier(bons(), { ...params, cible: 100000, minimum: 300 });
    expect(r.factures.every((f) => f.total >= 300)).toBe(true);
    expect(r.ignores.length).toBeGreaterThan(0);
  });

  it("ne fait rien sans BL disponible", () => {
    expect(planifier([], params).factures).toEqual([]);
  });
});
