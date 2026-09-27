// @ts-check
import { describe, expect, test } from "bun:test";
import { openQuote } from "./raydium-open-quote.js";

describe("raydium open quote refusals", () => {
  test("a range off the tick spacing names the multiple to use as its remedy", () => {
    const result = openQuote(
      { tickLower: 5, tickUpper: 65, amountA: "0", amountB: "0" },
      { tickSpacing: 60 },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("is not aligned to the pool's tick spacing of 60");
    expect(result.remedy).toBe("pass tickLower and tickUpper that are multiples of 60");
  });
});
