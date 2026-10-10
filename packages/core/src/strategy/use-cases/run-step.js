// @ts-check
import { Effect } from "effect";
import { BoundsExceeded } from "../../shared/domain/engine-errors.js";
import { compareDecimal } from "../domain/decimal.js";
import { KillSwitchEngaged, StrategyNotFound } from "../domain/errors.js";
import { CapLedger } from "../ports/cap-ledger.js";
import { SpendMeter } from "../ports/spend-meter.js";
import { TickSubmit } from "../ports/tick-submit.js";

/**
 * @typedef {{
 *   readonly outcome: "executed" | "failed" | "skipped_bounds" | "skipped_observation" | "in_flight";
 *   readonly intent?: import("../domain/tick.js").TickIntent;
 *   readonly reason?: string;
 *   readonly remedy?: string;
 * }} StepResult
 */

/**
 * Reserve, send, and settle one Action. A settle above the hold is recorded here. The ledger
 * engages the kill switch itself.
 * @param {{ strategyId: string; tickId: string; intentId: string; action: import("@solos-sh/actions").Action }} input
 * @returns {import("effect").Effect.Effect<StepResult, unknown, SpendMeter | CapLedger | TickSubmit>}
 */
export const runStep = (input) =>
  Effect.gen(function* () {
    const quoted = yield* (yield* SpendMeter).quote(input.action).pipe(Effect.either);
    if (quoted._tag === "Left") return observationSkip(quoted.left);
    const reserved = yield* reserve(input, quoted.right);
    if (!reserved.ok) return reserved.outcome;
    const sent = yield* (yield* TickSubmit).submit({ intentId: input.intentId, action: input.action });
    return yield* finish(reserved.reservationId, quoted.right, sent);
  });

/**
 * @param {{ strategyId: string; tickId: string; intentId: string }} input
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 */
const reserve = (input, quote) =>
  Effect.gen(function* () {
    const held = yield* (yield* CapLedger)
      .reserve({
        strategyId: input.strategyId,
        tickId: input.tickId,
        intentId: input.intentId,
        notionalUsd: quote.reserveUsd,
        mint: quote.mint,
      })
      .pipe(Effect.either);
    if (held._tag === "Left") return { ok: /** @type {const} */ (false), outcome: boundsSkip(held.left) };
    return { ok: /** @type {const} */ (true), reservationId: held.right.reservationId };
  });

/**
 * @param {string} reservationId
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 */
const finish = (reservationId, quote, sent) =>
  Effect.gen(function* () {
    const ledger = yield* CapLedger;
    const intent = intentOf(sent, quote);
    if (sent.state === "in_flight") return { outcome: /** @type {const} */ ("in_flight"), intent };
    if (sent.state === "failed") return yield* failed({ ledger, reservationId, sent, intent });
    yield* ledger.settle(reservationId, quote.actualUsd);
    return settled(quote, intent);
  });

/**
 * A landed execution error settles the fee it paid. Anything else releases the hold.
 * @param {{
 *   ledger: import("../ports/cap-ledger.js").CapLedgerShape;
 *   reservationId: string;
 *   sent: import("../ports/tick-submit.js").SubmitResult;
 *   intent: import("../domain/tick.js").TickIntent;
 * }} input
 */
const failed = (input) =>
  Effect.gen(function* () {
    if (input.sent.feeUsd !== undefined) {
      yield* input.ledger.settle(input.reservationId, input.sent.feeUsd);
    } else yield* input.ledger.release(input.reservationId);
    return {
      outcome: /** @type {const} */ ("failed"),
      intent: input.intent,
      reason: input.sent.reason,
      remedy: input.sent.remedy,
    };
  });

/**
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @param {import("../domain/tick.js").TickIntent} intent
 * @returns {StepResult}
 */
const settled = (quote, intent) => {
  if (compareDecimal(quote.actualUsd, quote.reserveUsd) <= 0) {
    return { outcome: "executed", intent };
  }
  return {
    outcome: "executed",
    intent,
    reason: `settled ${quote.actualUsd} USD is above the reserved hold of ${quote.reserveUsd} USD`,
    remedy: "the strategy kill switch is engaged; disengage it before the next tick",
  };
};

/** @param {unknown} error @returns {StepResult} */
const boundsSkip = (error) => ({
  outcome: "skipped_bounds",
  reason: reasonOf(error),
  remedy: remedyOf(error),
});

/** @param {unknown} error @returns {StepResult} */
const observationSkip = (error) => ({
  outcome: "skipped_observation",
  reason: reasonOf(error) || "an observation required to price this reservation was missing",
  remedy: "retry when the price for this reservation is available",
});

/**
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @returns {import("../domain/tick.js").TickIntent}
 */
const intentOf = (sent, quote) => ({
  intentId: sent.intentId,
  state: sent.state,
  ...(sent.signature != null ? { signature: sent.signature } : {}),
  notionalUsd: quote.reserveUsd,
  mint: quote.mint,
});

/** @param {unknown} error */
const reasonOf = (error) => {
  if (error instanceof BoundsExceeded || error instanceof KillSwitchEngaged) return error.reason ?? "";
  if (error instanceof StrategyNotFound) return error.reason ?? "";
  if (typeof error === "object" && error !== null && "reason" in error) {
    return String(/** @type {{ reason?: unknown }} */ (error).reason ?? "");
  }
  return "";
};

/** @param {unknown} error */
const remedyOf = (error) => {
  if (typeof error === "object" && error !== null && "remedy" in error) {
    return String(/** @type {{ remedy?: unknown }} */ (error).remedy ?? "");
  }
  return "lower the notional or raise the strategy bounds";
};
