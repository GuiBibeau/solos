// @ts-check
/**
 * Opening and closing a concentrated-liquidity position.
 *
 * The range is the caller's, always. solOS validates it and refuses an unaligned one rather than
 * rounding, because rounding a range is choosing one — and choosing is strategy, which ADR-0006
 * keeps upstream of this layer.
 */
import {
  ClosePositionActionSchema,
  OpenPositionActionSchema,
  openPositionIssue,
} from "@solos/actions";
import { Effect } from "effect";
import { executeAction } from "../../shared/use-cases/execute-action.js";
import { simulateAction } from "../../shared/use-cases/simulate-action.js";
import { LiquidityInputInvalid, LiquidityUnsupportedProtocol } from "../domain/errors.js";
import { ClosePositionInput, OpenPositionInput } from "../domain/lifecycle-types.js";
import { hasLifecycle } from "../domain/types.js";

/** @param {string} reason */
const invalid = (reason) => new LiquidityInputInvalid({ reason });

/**
 * Meteora's refusal is named here, ahead of the generic schema sentence, so an illegal width
 * says what was wrong with that width. Close intents are not opens and are left alone.
 * @param {unknown} input
 * @returns {string | null}
 */
const meteoraOpenRefusal = (input) => {
  if (typeof input !== "object" || input === null) return null;
  if (/** @type {{ protocol?: unknown }} */ (input).protocol !== "meteora") return null;
  return openPositionIssue(input);
};

/**
 * A custom schema issue names the field that failed. Anything else keeps the verb's sentence.
 * @param {{ success: boolean; error?: { issues: readonly { code: string; message: string }[] } }} parsed
 * @param {string} reason
 */
const parseReason = (parsed, reason) => {
  if (parsed.success) return reason;
  const custom = parsed.error?.issues.find((issue) => issue.code === "custom");
  return custom === undefined ? reason : custom.message;
};

/**
 * Validate one lifecycle intent into its published Action, gating the protocol the same way
 * every other liquidity verb does.
 * @template T
 * @param {{ schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } };
 *   toAction: (request: T) => unknown; reason: string; meteoraOpen: boolean }} verb
 * @param {unknown} input
 */
const validated = ({ schema, toAction, reason, meteoraOpen }, input) =>
  Effect.gen(function* () {
    if (meteoraOpen === true) {
      const refusal = meteoraOpenRefusal(input);
      if (refusal !== null) return yield* invalid(refusal);
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) return yield* invalid(parseReason(parsed, reason));
    const protocol = /** @type {{ protocol: string }} */ (parsed.data).protocol;
    if (!hasLifecycle(protocol)) return yield* new LiquidityUnsupportedProtocol({ protocol });
    const action = toAction(parsed.data);
    if (action === null) return yield* invalid("the request does not satisfy the Action contract");
    return action;
  });

/**
 * Lift one validated intent into its published Action, or null when the two contracts disagree.
 * @param {import("zod").ZodType} schema @param {string} type
 */
const lifted = (schema, type) => (/** @type {unknown} */ input) => {
  const parsed = schema.safeParse({ type, .../** @type {object} */ (input) });
  return parsed.success ? parsed.data : null;
};

const OPEN = {
  schema: OpenPositionInput,
  toAction: lifted(OpenPositionActionSchema, "open_position"),
  meteoraOpen: true,
  reason:
    "an open needs a protocol with an adapter and a base58 pool. raydium also needs integer " +
    "ticks with lower below upper, u64 base-unit budgets with at least one positive, and " +
    "0..9999 bps slippage. meteora needs integer lowerBinId and width and takes no token budget",
};

const CLOSE = {
  schema: ClosePositionInput,
  toAction: lifted(ClosePositionActionSchema, "close_position"),
  meteoraOpen: false,
  reason: "a close needs a protocol with an adapter and a base58 position account",
};

/** @param {import("../domain/lifecycle-types.js").LiquidityOpenInput} input */
export const simulateOpenPosition = (input) =>
  Effect.gen(function* () {
    const action = yield* validated(OPEN, input);
    return yield* simulateAction({ action: /** @type {any} */ (action) });
  }).pipe(Effect.withSpan("liquidity.simulateOpenPosition"));

/** @param {import("../domain/lifecycle-types.js").LiquidityExecuteOpenInput} input */
export const executeOpenPosition = (input) =>
  Effect.gen(function* () {
    const action = yield* validated(OPEN, input);
    return yield* executeAction({
      action: /** @type {any} */ (action),
      skipSimulation: /** @type {{ skipSimulation?: boolean }} */ (input).skipSimulation === true,
      event: "liquidity.positionOpened",
    });
  }).pipe(Effect.withSpan("liquidity.executeOpenPosition"));

/** @param {import("../domain/lifecycle-types.js").LiquidityCloseInput} input */
export const simulateClosePosition = (input) =>
  Effect.gen(function* () {
    const action = yield* validated(CLOSE, input);
    return yield* simulateAction({ action: /** @type {any} */ (action) });
  }).pipe(Effect.withSpan("liquidity.simulateClosePosition"));

/** @param {import("../domain/lifecycle-types.js").LiquidityExecuteCloseInput} input */
export const executeClosePosition = (input) =>
  Effect.gen(function* () {
    const action = yield* validated(CLOSE, input);
    return yield* executeAction({
      action: /** @type {any} */ (action),
      skipSimulation: /** @type {{ skipSimulation?: boolean }} */ (input).skipSimulation === true,
      event: "liquidity.positionClosed",
    });
  }).pipe(Effect.withSpan("liquidity.executeClosePosition"));
