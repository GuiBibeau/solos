// @ts-check
import { AddLiquidityActionSchema } from "@solos/actions";
import { Effect } from "effect";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";

/** @typedef {import("../domain/errors.js").LiquidityInputInvalid | LiquidityUnsupportedProtocol} DepositValidationError */
/** @typedef {import("../domain/types.js").LiquidityDepositInput} LiquidityDepositInput */

/**
 * Validate one deposit intent identically for every entry point — tool, CLI, harness — before
 * any executor access: schema first, then the protocol gate, so meteora and raydium fail
 * before the network and before any Layer that could reach one is built.
 * @template {{ protocol: "orca" | "meteora" | "raydium"; amountA: string; amountB: string }} T
 * @param {{ safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }} schema
 * @param {unknown} input
 * @returns {import("effect").Effect.Effect<T, DepositValidationError>}
 */
export const validateDepositInput = (schema, input) =>
  Effect.gen(function* () {
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return yield* new LiquidityInputInvalid({
        reason:
          "a deposit needs protocol orca|meteora|raydium, pool and position base58 addresses, " +
          "amountA and amountB as u64 decimal strings, and maxSlippageBps in 0..9999 when given",
      });
    }
    if (!/[1-9]/.test(parsed.data.amountA + parsed.data.amountB)) {
      return yield* new LiquidityInputInvalid({
        reason: "at least one token spend budget must be positive",
      });
    }
    if (parsed.data.protocol !== "orca") {
      return yield* new LiquidityUnsupportedProtocol({ protocol: parsed.data.protocol });
    }
    return parsed.data;
  });

/**
 * The validated request becomes the shared contract's `add_liquidity` Action. The re-parse is
 * the identity guard: core and contract must agree byte for byte, and a drift fails here,
 * before an executor is ever asked to act.
 * @param {LiquidityDepositInput} request
 * @returns {import("@solos/actions").AddLiquidityAction | null}
 */
export const toDepositAction = (request) => {
  const parsed = AddLiquidityActionSchema.safeParse({
    type: "add_liquidity",
    protocol: request.protocol,
    pool: request.pool,
    position: request.position,
    amountA: request.amountA,
    amountB: request.amountB,
    maxSlippageBps: request.maxSlippageBps,
  });
  return parsed.success ? parsed.data : null;
};
