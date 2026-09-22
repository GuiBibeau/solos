// @ts-check
import { LendActionSchema } from "@solos/actions";
import { Effect } from "effect";
import { LendingInputInvalid } from "../domain/errors.js";

/** @typedef {LendingInputInvalid} DepositValidationError */

/**
 * Validate one deposit intent identically for every entry point — tool, CLI, harness —
 * before any executor access: the schema rules are the exact-amount contract (a decodable
 * mint, a positive u64 base-unit amount), so a malformed request fails typed and offline.
 * @template {{ readonly mint: string; readonly amount: string }} T
 * @param {{ safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }} schema
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<T, DepositValidationError>}
 */
export const validateDepositInput = (schema, input) =>
  Effect.gen(function* () {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return yield* new LendingInputInvalid({
        reason:
          "a deposit needs a mint that decodes to a 32-byte address and a positive u64 " +
          "base-unit amount as an integer string",
      });
    }
    return parsed.data;
  });

/**
 * The validated request becomes the shared contract's `lend` Action carrying the configured
 * market identity (ADR-0019): the executor revalidates it against its own configuration. The
 * re-parse is the identity guard — core and contract must agree byte for byte, and a drift
 * fails here, before an executor is ever asked to act.
 * @param {import("../domain/types.js").LendDepositInput} request
 * @param {string} market
 * @returns {import("@solos/actions").LendAction | null}
 */
export const toDepositAction = (request, market) => {
  const parsed = LendActionSchema.safeParse({
    type: "lend",
    protocol: "kamino",
    market,
    mint: request.mint,
    amount: request.amount,
  });
  return parsed.success ? parsed.data : null;
};
