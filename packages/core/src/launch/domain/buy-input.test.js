// @ts-check
/**
 * The buy intent's bounds, and that everything the schema accepts the published Action contract
 * also accepts. A tool schema wider than the contract it feeds produces a refusal whose message
 * contradicts the schema that allowed the value.
 */
import { describe, expect, test } from "bun:test";
import { WSOL_MINT, toBuyAction } from "../use-cases/to-buy-action.js";
import { LaunchBuyInputSchema } from "./types.js";

const MINT = "UYGGYygeDt9SfsVBf2qBNtU4bFPhrR6DVVCRf7fpump";

describe("pump buy input bounds", () => {
  // The tool schema and the published Action contract must agree. 10000 bps used to pass the
  // schema and then fail conversion with a message claiming it was valid.
  test("slippage stops where the Action contract stops", () => {
    expect(
      LaunchBuyInputSchema.safeParse({ mint: MINT, amount: "1", maxSlippageBps: 9999 }).success,
    ).toBe(true);
    expect(
      LaunchBuyInputSchema.safeParse({ mint: MINT, amount: "1", maxSlippageBps: 10_000 }).success,
    ).toBe(false);
  });

  test("an accepted slippage always converts to an Action", () => {
    for (const maxSlippageBps of [1, 50, 9999]) {
      const parsed = LaunchBuyInputSchema.parse({ mint: MINT, amount: "1000", maxSlippageBps });
      expect(toBuyAction(parsed)).not.toBeNull();
    }
  });

  test("a budget must be a positive u64 in base units", () => {
    expect(LaunchBuyInputSchema.safeParse({ mint: MINT, amount: "0" }).success).toBe(false);
    expect(LaunchBuyInputSchema.safeParse({ mint: MINT, amount: "-1" }).success).toBe(false);
    expect(LaunchBuyInputSchema.safeParse({ mint: MINT, amount: "1.5" }).success).toBe(false);
  });

  test("the Action carries pump as its explicit route and wSOL as its input", () => {
    const action = toBuyAction(LaunchBuyInputSchema.parse({ mint: MINT, amount: "1000" }));
    expect(action).toMatchObject({
      type: "swap",
      venue: "pump",
      inputMint: WSOL_MINT,
      outputMint: MINT,
    });
  });
});
