import { describe, expect, it } from "vitest";
import { htDepuisMarge, htDepuisTTC, margeDepuis, prixTTC, ttcDepuisHT } from "./tarifs";

// Ligne réelle exportée du logiciel de la société : achat HT 15,858 · vente HT 19,244 · TTC 22,900 · marge 21,35 %.
describe("tarifs", () => {
  it("le TTC fixé retombe exactement sur lui-même", () => {
    const ht = htDepuisTTC(22.9, 19);
    expect(ht).toBe(19.243697);
    expect(ttcDepuisHT(ht, 19)).toBe(22.9);
  });

  it("garde le total exact sur de grosses quantités", () => {
    const total = (ht: number, q: number) => ttcDepuisHT(ht * q, 19);
    expect(total(htDepuisTTC(22.9, 19), 60)).toBe(1374);
    // Avec un HT arrondi à 3 décimales (19,244), l'écart apparaît : 1 374,022.
    expect(total(19.244, 60)).toBe(1374.022);
  });

  it("calcule la marge sur le prix d'achat", () => {
    expect(margeDepuis(19.244, 15.858)).toBe(21.35);
    expect(margeDepuis(5, 0)).toBeUndefined();
  });

  it("applique une marge : TTC arrondi au millime, HT déduit", () => {
    const ht = htDepuisMarge(15.858, 21.35, 19);
    expect(ttcDepuisHT(ht, 19)).toBe(22.9);
    expect(htDepuisMarge(10, 30, 19)).toBe(13);
  });

  // Article du fichier réel soumis à la FODEC : TTC 18,560 · HT 15,442 · TVA 19 %.
  it("FODEC : la TVA se calcule sur HT + FODEC", () => {
    const ht = htDepuisTTC(18.56, 19, 1);
    expect(ht).toBeCloseTo(15.442216, 6);
    expect(ttcDepuisHT(ht, 19, 1)).toBe(18.56);
    expect(prixTTC({ prixVente: ht, tva: "19", fodec: "1" })).toBe(18.56);
    expect(prixTTC({ prixVente: 5, tva: 19 })).toBe(5.95);
  });

  it("TVA à 0 : HT = TTC", () => {
    expect(htDepuisTTC(5, 0)).toBe(5);
  });
});
