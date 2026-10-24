import { describe, expect, it } from "vitest";
import { appliquerPromotions, htLigne, margePromo } from "./promotions";
import type { ArticlePromo, Promotion } from "../types/promotion";

const A: ArticlePromo = { id: "a", designation: "Yaourt", prixAchat: 0.4, prixVente: 0.5, tva: 0, fodec: 0 };
const B: ArticlePromo = { id: "b", designation: "Fromage", prixAchat: 8, prixVente: 10, tva: 19, fodec: 0 };
const articles = new Map([
  ["a", A],
  ["b", B],
]);
const jour = new Date(2026, 9, 21);
const promo = (p: Partial<Promotion> & Pick<Promotion, "lignes">): Promotion => ({
  id: "p1",
  type: "LOT",
  numero: "LT-26/0001",
  dateDebut: "2026-10-01",
  dateFin: "2026-10-31",
  statut: "EN_COURS",
  ...p,
});
const ligne = (articleId: string, quantite: number, prixUnitaire: number) => ({ articleId, quantite, prixUnitaire, tauxTva: 0 });

describe("appliquerPromotions", () => {
  it("prix promo : le prix de la ligne devient le prix promo", () => {
    const [l] = appliquerPromotions([ligne("b", 3, 10)], [promo({ type: "PRIX", lignes: [{ articleId: "b", prixPromo: 9 }] })], articles, jour);
    expect(l.prixUnitaire).toBe(9);
    expect(l.promotionId).toBe("p1");
  });

  it("1 + 1 : autant d'offertes que de payées", () => {
    const [l] = appliquerPromotions([ligne("a", 4, 0.5)], [promo({ mode: "UN_PLUS_UN", lignes: [{ articleId: "a" }] })], articles, jour);
    expect(l.quantiteOfferte).toBe(4);
    expect(htLigne(l)).toBe(2);
  });

  it("N + 1 : une offerte par tranche de N, rien sous le seuil", () => {
    const p = promo({ mode: "N_PLUS_UN", lignes: [{ articleId: "a", seuil: 3 }] });
    expect(appliquerPromotions([ligne("a", 7, 0.5)], [p], articles, jour)[0].quantiteOfferte).toBe(2);
    const sous = appliquerPromotions([ligne("a", 2, 0.5)], [p], articles, jour)[0];
    expect(sous.quantiteOfferte).toBe(0);
    expect(sous.promotionId).toBeNull();
    expect(sous.promo?.texte).toContain("pas encore atteint");
  });

  it("2e à −50 % : une pièce sur deux à moitié prix", () => {
    const [l] = appliquerPromotions([ligne("b", 5, 10)], [promo({ mode: "DEUXIEME_MOITIE", lignes: [{ articleId: "b" }] })], articles, jour);
    expect(l.remise).toBe(10);
    expect(htLigne(l)).toBe(40);
  });

  it("prix du lot : chaque lot complet au prix du lot, le reste au prix normal", () => {
    const [l] = appliquerPromotions([ligne("a", 25, 0.5)], [promo({ mode: "PRIX_LOT", lignes: [{ articleId: "a", tailleLot: 10, prixLot: 4 }] })], articles, jour);
    expect(l.remise).toBe(2);
    expect(htLigne(l)).toBe(10.5);
  });

  it("article offert : ajouté à 0, ou ajouté à sa ligne s'il est déjà au BL", () => {
    const p = promo({ mode: "CADEAU", lignes: [{ articleId: "b", articleOffertId: "a", quantiteOfferte: 2 }] });
    const seul = appliquerPromotions([ligne("b", 3, 10)], [p], articles, jour);
    expect(seul).toHaveLength(2);
    expect(seul[1]).toMatchObject({ articleId: "a", quantite: 0, quantiteOfferte: 6 });
    const avec = appliquerPromotions([ligne("b", 3, 10), ligne("a", 5, 0.5)], [p], articles, jour);
    expect(avec).toHaveLength(2);
    expect(avec[1]).toMatchObject({ articleId: "a", quantite: 5, quantiteOfferte: 6 });
  });

  it("hors période : aucune promotion", () => {
    const [l] = appliquerPromotions([ligne("a", 4, 0.5)], [promo({ mode: "UN_PLUS_UN", dateFin: "2026-10-20", lignes: [{ articleId: "a" }] })], articles, jour);
    expect(l.quantiteOfferte).toBe(0);
    expect(l.promo).toBeUndefined();
  });
});

describe("margePromo", () => {
  it("1 + 1 sur un yaourt acheté 0,400 vendu 0,500 : vente à perte", () => {
    expect(margePromo("UN_PLUS_UN", { articleId: "a", article: A })).toBe(-37.5);
  });
});
