// @ts-check
/**
 * The sell intent's bounds, and that everything the schema accepts the published Action contract
 * also accepts. The sell's `amount` is a coin quantity where the buy's is a lamport budget, so
 * the two schemas are checked separately rather than one standing in for the other.
 */
import { describe, expect, test } from "bun:test";
import { WSOL_MINT, toBuyAction, toSellAction } from "../use-cases/to-buy-action.js";
import { LaunchSellInputSchema } from "./types.js";

const MINT = "UYGGYygeDt9SfsVBf2qBNtU4bFPhrR6DVVCRf7fpump";

describe("pump sell input bounds", () => {
  test("slippage stops where the Action contract stops", () => {
    expect(
      LaunchSellInputSchema.safeParse({ mint: MINT, amount: "1", maxSlippageBps: 9999 }).success,
    ).toBe(true);
    expect(
      LaunchSellInputSchema.safeParse({ mint: MINT, amount: "1", maxSlippageBps: 10_000 }).success,
    ).toBe(false);
  });

  test("an accepted slippage always converts to an Action", () => {
    for (const maxSlippageBps of [1, 50, 9999]) {
      const parsed = LaunchSellInputSchema.parse({ mint: MINT, amount: "1000", maxSlippageBps });
      expect(toSellAction(parsed)).not.toBeNull();
    }
  });

  test("a quantity must be a positive u64 in base units", () => {
    expect(LaunchSellInputSchema.safeParse({ mint: MINT, amount: "0" }).success).toBe(false);
    expect(LaunchSellInputSchema.safeParse({ mint: MINT, amount: "-1" }).success).toBe(false);
    expect(LaunchSellInputSchema.safeParse({ mint: MINT, amount: "1.5" }).success).toBe(false);
  });

  test("the Action carries pump as its explicit route and wSOL as its output", () => {
    const action = toSellAction(LaunchSellInputSchema.parse({ mint: MINT, amount: "1000" }));
    expect(action).toMatchObject({
      type: "swap",
      venue: "pump",
      inputMint: MINT,
      outputMint: WSOL_MINT,
    });
  });

  test("a sell of wSOL itself is refused: the contract needs SOL on exactly one side", () => {
    const parsed = LaunchSellInputSchema.parse({ mint: WSOL_MINT, amount: "1000" });
    expect(toSellAction(parsed)).toBeNull();
  });

  test("the sell is the buy's sides inverted, not a second route", () => {
    const request = LaunchSellInputSchema.parse({ mint: MINT, amount: "1000" });
    const sell = toSellAction(request);
    const buy = toBuyAction(request);
    expect(sell?.venue).toBe(/** @type {string} */ (buy?.venue));
    expect(sell?.inputMint).toBe(/** @type {string} */ (buy?.outputMint));
    expect(sell?.outputMint).toBe(/** @type {string} */ (buy?.inputMint));
  });
});
