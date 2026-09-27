// @ts-check
import { describe, expect, test } from "bun:test";
import { InsufficientFunds } from "./errors.js";

describe("transfer domain errors", () => {
  test("an insufficient balance is readable as SOL and names the next action", () => {
    const error = new InsufficientFunds({
      owner: "2".repeat(44),
      required: "2000000000",
      available: "500000000",
    });
    expect(error.reason).toContain("2 SOL");
    expect(error.reason).toContain("0.5 SOL");
    expect(error.remedy).toContain("fund the wallet");
  });
});
