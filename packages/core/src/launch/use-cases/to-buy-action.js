// @ts-check
import { SwapActionSchema } from "@solos/actions";
import { Effect } from "effect";
import { CurveInputInvalid } from "../domain/errors.js";

/** Native SOL's wrapped mint: the Action contract requires it on exactly one side of a Pump swap. */
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Validate one buy intent identically for every entry point before an executor is reachable.
 * @template {{ readonly mint: string; readonly amount: string; readonly maxSlippageBps: number }} T
 * @param {{ safeParse: (value: unknown) => { success: true; data: T } | { success: false } }} schema
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<T, CurveInputInvalid>}
 */
export const validateBuyInput = (schema, input) => {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        new CurveInputInvalid({
          reason:
            "a buy needs a mint that decodes to a 32-byte address, a positive u64 lamport " +
            "budget as an integer string, and a slippage bound between 1 and 9999 bps",
        }),
      );
};

/**
 * The validated request becomes the shared contract's `swap` Action carrying `venue: "pump"`.
 *
 * That venue field is the whole route identity: the executor selects Pump from the Action and
 * never infers it from the output mint, so an ordinary swap of the same coin still goes to
 * Jupiter. The input mint is wSOL because that is what makes this a buy under the contract's
 * refinement, and `amount` stays the caller's lamport budget rather than becoming a token
 * quantity.
 *
 * The re-parse is the identity guard: core and the published contract must agree byte for byte,
 * and a drift fails here rather than at an executor.
 * @param {{ mint: string; amount: string; maxSlippageBps: number }} request
 * @returns {import("@solos/actions").SwapAction | null}
 */
export const toBuyAction = (request) => {
  const parsed = SwapActionSchema.safeParse({
    type: "swap",
    venue: "pump",
    inputMint: WSOL_MINT,
    outputMint: request.mint,
    amount: request.amount,
    maxSlippageBps: request.maxSlippageBps,
  });
  return parsed.success ? parsed.data : null;
};

/**
 * The sell's Action: the same `venue: "pump"` route identity with the sides inverted — the coin
 * is the input and wSOL the output. The contract's rule is wSOL on exactly one side, so this is
 * the mirror of the buy rather than an exception to it.
 * @param {{ mint: string; amount: string; maxSlippageBps: number }} request
 * @returns {import("@solos/actions").SwapAction | null}
 */
export const toSellAction = (request) => {
  const parsed = SwapActionSchema.safeParse({
    type: "swap",
    venue: "pump",
    inputMint: request.mint,
    outputMint: WSOL_MINT,
    amount: request.amount,
    maxSlippageBps: request.maxSlippageBps,
  });
  return parsed.success ? parsed.data : null;
};

/**
 * Validate one sell intent. Separate from the buy's validator so the message names what a sell
 * actually needs: a coin quantity, not a lamport budget.
 * @template {{ readonly mint: string; readonly amount: string; readonly maxSlippageBps: number }} T
 * @param {{ safeParse: (value: unknown) => { success: true; data: T } | { success: false } }} schema
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<T, CurveInputInvalid>}
 */
export const validateSellInput = (schema, input) => {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? Effect.succeed(parsed.data)
    : Effect.fail(
        new CurveInputInvalid({
          reason:
            "a sell needs a mint that decodes to a 32-byte address, a positive u64 quantity of " +
            "the coin in base units as an integer string, and a slippage bound between 1 and " +
            "9999 bps",
        }),
      );
};
