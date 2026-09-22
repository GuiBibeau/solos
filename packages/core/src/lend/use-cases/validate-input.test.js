// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect } from "effect";
import { LendingInputInvalid } from "../domain/errors.js";
import { LendDepositInputSchema } from "../domain/types.js";
import { toDepositAction, validateDepositInput } from "./validate-input.js";

const MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** @param {Effect.Effect<unknown, unknown, never>} effect */
const failureOf = async (effect) => {
  const exit = await Effect.runPromiseExit(effect);
  if (exit._tag !== "Failure") throw new Error("expected a failure");
  const failure = Cause.failureOption(exit.cause);
  if (failure._tag !== "Some") throw new Error(`not a failure value: ${String(exit.cause)}`);
  return failure.value;
};

describe("lend deposit input validation", () => {
  test("schema failures are one typed error with a fixed reason, before any executor access", async () => {
    const failure = await failureOf(validateDepositInput(LendDepositInputSchema, { mint: "x" }));
    expect(failure).toBeInstanceOf(LendingInputInvalid);
    expect(/** @type {LendingInputInvalid} */ (failure)?.reason).toContain("32-byte address");
  });

  test("a validated request becomes the shared lend Action with the configured market", () => {
    const request = { mint: MINT, amount: "1000000", owner: undefined };
    const action = toDepositAction(
      /** @type {import("../domain/types.js").LendDepositInput} */ (request),
      MARKET,
    );
    expect(action).toEqual({
      type: "lend",
      protocol: "kamino",
      market: MARKET,
      mint: MINT,
      amount: "1000000",
    });
  });

  test("an action-shaped drift never reaches an executor", () => {
    const action = toDepositAction(/** @type {any} */ ({ mint: MINT, amount: "0" }), MARKET);
    expect(action).toBeNull();
  });
});
