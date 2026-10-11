// @ts-check
import { WSOL_MINT } from "@solos-sh/actions";
import { readIntent } from "./intents.js";
import { reconcileIntent } from "./recover.js";
import { measuredSpend, readFee, readQuote, takeRpc } from "./tick-clock-chain.js";
import { applySteps, closeTick } from "./tick-clock-close.js";

/** @typedef {import("./http.js").EngineDeps["runtime"]} TickRuntime */
/** @typedef {import("./tick-clock-chain.js").RpcBudget} RpcBudget */
/** @typedef {import("./tick-clock-chain.js").SpendQuote} SpendQuote */
/** @typedef {import("./tick-clock-close.js").StepDecision} StepDecision */
/** @typedef {import("@solos/core/strategy").Tick} Tick */
/** @typedef {import("@solos-sh/actions").Strategy} Strategy */

/**
 * Look up one in-flight Tick's signed Intents and settle or release each hold.
 * Missing fees and unsigned steps leave the Tick in flight.
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 * @param {{ strategy: Strategy; tick: Tick; budget: RpcBudget }} work
 */
export const reconcileOneTick = async (runtime, db, work) => {
  if (work.tick.actions.length === 0) return;
  const steps = await stepDecisions(runtime, db, work);
  if (steps === undefined || steps.some((step) => step.kind === "leave" || step.kind === "stop")) {
    return;
  }
  const applied = await applySteps(runtime, work, steps);
  if (!applied) return;
  await closeTick(runtime, work.strategy, { tick: work.tick, steps });
};

/**
 * @param {string} strategyId
 * @param {string} tickId
 * @param {number} step
 */
export const tickIntentId = (strategyId, tickId, step) => `${strategyId}.${tickId}.${step}`;

/**
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 * @param {{ strategy: Strategy; tick: Tick; budget: RpcBudget }} work
 * @returns {Promise<StepDecision[] | undefined>}
 */
const stepDecisions = async (runtime, db, work) => {
  /** @type {StepDecision[]} */
  const steps = [];
  for (let step = 0; step < work.tick.actions.length; step += 1) {
    const decision = await decideStep(runtime, db, { ...work, step });
    if (decision.kind === "stop") return undefined;
    steps.push(decision);
  }
  return steps;
};

/**
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 * @param {{ tick: Tick; budget: RpcBudget; step: number }} work
 * @returns {Promise<StepDecision>}
 */
const decideStep = async (runtime, db, work) => {
  const intentId = tickIntentId(work.tick.strategyId, work.tick.tickId, work.step);
  const signature = persistedSignature(db, intentId);
  if (signature === null) return { kind: "leave" };
  const row = await refreshed(runtime, db, { budget: work.budget, intentId });
  if (row === "stop") return { kind: "stop" };
  if (row.state === "failed") return releaseOf(work.tick, work.step, { intentId, signature });
  if (row.state !== "settled") return { kind: "leave" };
  return landed(runtime, work, { row, signature });
};

/**
 * Boot and the clock share `reconcileIntent` for a signature that may still be in flight.
 * @param {TickRuntime} runtime
 * @param {import("bun:sqlite").Database} db
 * @param {{ budget: RpcBudget; intentId: string }} input
 */
const refreshed = async (runtime, db, input) => {
  const row = readIntent(db, input.intentId);
  if (row.state !== "in_flight") return row;
  if (!takeRpc(input.budget, 2)) return /** @type {const} */ ("stop");
  await reconcileIntent({ db, runtime }, input.intentId);
  return readIntent(db, input.intentId);
};

/**
 * @param {TickRuntime} runtime
 * @param {{ tick: Tick; budget: RpcBudget; step: number }} work
 * @param {{ row: ReturnType<typeof readIntent>; signature: string }} landedRow
 * @returns {Promise<StepDecision>}
 */
const landed = async (runtime, work, landedRow) => {
  const intentId = tickIntentId(work.tick.strategyId, work.tick.tickId, work.step);
  const quote = await runtime.runPromise(readQuote(work.tick.actions[work.step]));
  if (quote === undefined) return { kind: "leave" };
  const priced = await pricedSpend(runtime, quote, {
    budget: work.budget,
    row: landedRow.row,
    signature: landedRow.signature,
  });
  if (priced === undefined) return { kind: "stop" };
  if (priced.kind === "leave") return { kind: "leave" };
  if (priced.kind === "release")
    return releaseOf(work.tick, work.step, { intentId, signature: landedRow.signature });
  return settleOf(work.tick, work.step, {
    intentId,
    signature: landedRow.signature,
    quote,
    usd: priced.usd,
    outcome: priced.outcome,
  });
};

/**
 * A confirmed transfer settles its quoted actual without a fee read. A swap waits for `meta.fee`.
 * @param {TickRuntime} runtime
 * @param {SpendQuote} quote
 * @param {{ budget: RpcBudget; row: ReturnType<typeof readIntent>; signature: string }} input
 */
const pricedSpend = async (runtime, quote, input) => {
  const status = settledStatus(input.row);
  if (status === "confirmed" && quote.solPriceUsd === undefined) {
    return measuredSpend(quote, status, undefined);
  }
  if (!takeRpc(input.budget, 1)) return undefined;
  const fee = await runtime.runPromise(readFee(input.signature));
  return measuredSpend(quote, status, fee);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 */
const persistedSignature = (db, intentId) => {
  const row = db.query("SELECT signature FROM intents WHERE intent_id = ?").get(intentId);
  if (row === null) return null;
  const signature = /** @type {{ signature: string | null }} */ (row).signature;
  if (signature === null || signature.length === 0) return null;
  return signature;
};

/**
 * @param {Tick} tick
 * @param {number} step
 * @param {{ intentId: string; signature: string }} ids
 * @returns {StepDecision}
 */
const releaseOf = (tick, step, ids) => ({
  kind: "release",
  outcome: "failed",
  intentId: ids.intentId,
  signature: ids.signature,
  notionalUsd: storedNotional(tick, step),
  mint: storedMint(tick, step),
});

/**
 * @param {Tick} tick
 * @param {number} step
 * @param {{
 *   intentId: string;
 *   signature: string;
 *   quote: SpendQuote;
 *   usd: string;
 *   outcome: "executed" | "failed";
 * }} input
 * @returns {StepDecision}
 */
const settleOf = (tick, step, input) => ({
  kind: "settle",
  outcome: input.outcome,
  intentId: input.intentId,
  signature: input.signature,
  usd: input.usd,
  notionalUsd: storedNotional(tick, step, input.quote.reserveUsd),
  mint: storedMint(tick, step, input.quote.mint),
});

/** @param {ReturnType<typeof readIntent>} row */
const settledStatus = (row) => {
  if (row.state !== "settled") return /** @type {const} */ ("failed");
  const status = /** @type {{ status?: unknown }} */ (row.result)?.status;
  if (status === "confirmed") return /** @type {const} */ ("confirmed");
  return /** @type {const} */ ("failed");
};

/** @param {Tick} tick @param {number} step @param {string} [fallback] */
const storedNotional = (tick, step, fallback = "0") => tick.intents[step]?.notionalUsd ?? fallback;

/** @param {Tick} tick @param {number} step @param {string} [fallback] */
const storedMint = (tick, step, fallback = WSOL_MINT) => tick.intents[step]?.mint ?? fallback;
