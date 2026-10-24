import { describe, expect, it } from "vitest";
import { montantEnLettres, nombreEnLettres } from "./montantEnLettres";

describe("nombreEnLettres", () => {
  it.each([
    [0, "zéro"],
    [1, "un"],
    [17, "dix-sept"],
    [21, "vingt et un"],
    [71, "soixante et onze"],
    [79, "soixante-dix-neuf"],
    [80, "quatre-vingts"],
    [81, "quatre-vingt-un"],
    [99, "quatre-vingt-dix-neuf"],
    [100, "cent"],
    [200, "deux cents"],
    [279, "deux cent soixante-dix-neuf"],
    [1000, "mille"],
    [2300, "deux mille trois cents"],
    [200000, "deux cent mille"],
    [1_000_000, "un million"],
  ])("%i → %s", (n, attendu) => {
    expect(nombreEnLettres(n)).toBe(attendu);
  });
});

describe("montantEnLettres", () => {
  it("dinars seuls", () => {
    expect(montantEnLettres(279)).toBe("Deux cent soixante-dix-neuf Dinars");
  });
  it("dinars et millimes", () => {
    expect(montantEnLettres(1279.5)).toBe("Mille deux cent soixante-dix-neuf Dinars et cinq cents Millimes");
  });
  it("un dinar", () => {
    expect(montantEnLettres(1)).toBe("Un Dinar");
  });
});
