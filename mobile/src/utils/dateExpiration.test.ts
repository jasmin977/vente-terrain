import { describe, expect, it } from "vitest";
import { dateExpirationDuTexte, datesDuTexte } from "./dateExpiration";

const jour = new Date(2026, 9, 12);

describe("dateExpirationDuTexte", () => {
  it("lit les formats courants", () => {
    expect(dateExpirationDuTexte("EXP 31/12/2026", jour)).toBe("2026-12-31");
    expect(dateExpirationDuTexte("A consommer avant le 05.03.27", jour)).toBe("2027-03-05");
    expect(dateExpirationDuTexte("EXP: 31 DEC 2026", jour)).toBe("2026-12-31");
    expect(dateExpirationDuTexte("2027-01-15", jour)).toBe("2027-01-15");
  });

  it("une date mois/année vaut la fin du mois", () => {
    expect(dateExpirationDuTexte("EXP 10/2026", jour)).toBe("2026-10-31");
    expect(dateExpirationDuTexte("BBE FEV 2027", jour)).toBe("2027-02-28");
  });

  it("garde l'expiration quand la fabrication est aussi imprimée", () => {
    expect(dateExpirationDuTexte("PROD 15/01/2026 EXP 15/01/2027 LOT 4421", jour)).toBe("2027-01-15");
  });

  it("ignore les dates impossibles et le bruit", () => {
    expect(datesDuTexte("31/02/2026")).toEqual([]);
    expect(dateExpirationDuTexte("LOT 12345 6194012345678", jour)).toBeNull();
  });
});
