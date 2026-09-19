// @ts-check
import { describe, expect, test } from "bun:test";
import { PerpInputInvalid } from "./errors.js";
import { normalizeMarketSymbol } from "./symbol.js";

describe("normalizeMarketSymbol", () => {
  test("maps user aliases to the bare uppercase wire symbol", () => {
    expect(normalizeMarketSymbol("SOL")).toBe("SOL");
    expect(normalizeMarketSymbol("sol")).toBe("SOL");
    expect(normalizeMarketSymbol("SOL-PERP")).toBe("SOL");
    expect(normalizeMarketSymbol("sol-perp")).toBe("SOL");
    expect(normalizeMarketSymbol("  Mega-Perp  ")).toBe("MEGA");
    expect(normalizeMarketSymbol("1000PEPE")).toBe("1000PEPE");
  });

  test("rejects grammar that could never be an exchange symbol", () => {
    for (const bad of [
      "",
      " ".repeat(3),
      "-SOL",
      "SOL-",
      "SOL--PERP",
      "SOL PERP",
      "SOL/PERP",
      "SOL@1",
    ]) {
      expect(() => normalizeMarketSymbol(bad), JSON.stringify(bad)).toThrow(PerpInputInvalid);
    }
  });

  test("the rejection carries a fixed reason, never the offending input", () => {
    let reason = "";
    try {
      normalizeMarketSymbol("WEIRD TICKER");
    } catch (error) {
      reason = /** @type {{ reason?: string }} */ (error).reason ?? "";
    }
    expect(reason).toContain("exchange symbol");
    expect(reason.includes("WEIRD")).toBe(false);
  });
});
