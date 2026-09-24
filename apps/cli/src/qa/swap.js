// @ts-check
/**
 * Swap reliability QA. Swap failures are route-dependent: Jupiter picks a different path each
 * call, so one attempt says nothing about whether the CLI can trade. This runs every pair for a
 * fixed number of rounds and reports how often it succeeded and how long it took.
 *
 * `simulate` is the default and never spends. `execute` sends real transactions and is only for
 * an authorised live round (AGENTS.md, Funds).
 */
import { executeSwap, getBalances, simulateSwap } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { withSolos } from "../runtime.js";
import { SWAP_PAIRS, WSOL, amountFor } from "./swap-cases.js";
import { SwapQaSchema } from "./swap-schema.js";
import { summarise } from "./swap-stats.js";

/** @typedef {import("./swap-cases.js").SwapPair} SwapPair */
/** @typedef {{ tier: "simulate" | "execute"; amountLamports: bigint; slippageBps: number; rounds: number; threshold: number }} SwapQaOptions */

/**
 * A stable, groupable outcome key. The tag alone is too coarse to act on — `SimulationFailed`
 * covers both a spend-bound refusal and a chain-level rejection, which call for opposite
 * responses — so a bounded slice of the reason rides along, with digits collapsed so numeric
 * variants of the same failure tally together instead of each counting once.
 * @param {unknown} error
 */
const reasonOf = (error) => {
  const failure = /** @type {{ _tag?: unknown; code?: unknown; reason?: unknown }} */ (error);
  const named = [failure?._tag, failure?.code].find((value) => typeof value === "string");
  const tag = named ?? "Unknown";
  if (typeof failure?.reason !== "string" || failure.reason.length === 0) return tag;
  const detail = failure.reason.replaceAll(/\d+/g, "N").replaceAll(/\s+/g, " ").trim().slice(0, 60);
  return `${tag}: ${detail}`;
};

/**
 * One attempt against one pair. A failure is recorded, never thrown: the point of the run is the
 * distribution of outcomes, so one bad route must not end the sweep.
 * @param {SwapPair} pair @param {SwapQaOptions} options
 */
const attempt = async (pair, options) => {
  const input = {
    inputMint: pair.inputMint,
    outputMint: pair.outputMint,
    amount: String(amountFor(pair, options.amountLamports)),
    slippageBps: options.slippageBps,
  };
  const started = performance.now();
  const exit = await (options.tier === "execute"
    ? Effect.runPromiseExit(withSolos(executeSwap(input)))
    : Effect.runPromiseExit(withSolos(simulateSwap(input))));
  const ms = Math.round(performance.now() - started);
  if (exit._tag === "Success") {
    const value = /** @type {{ ok?: boolean }} */ (exit.value);
    // A simulation that returns ok:false is a chain-level refusal, not a transport success.
    return { reason: value?.ok === false ? "SimulationRejected" : "ok", ms };
  }
  const failure = Cause.failureOption(exit.cause);
  return { reason: reasonOf(Option.getOrUndefined(failure)), ms };
};

/**
 * What the wallet actually holds of one mint, in base units. A pair the wallet cannot fund would
 * fail every round on insufficient funds and read as a broken venue — a reliability report that
 * blames the product for its own setup is worse than none, so those pairs are skipped instead.
 * @param {{ lamports: string; tokens: ReadonlyArray<{ mint: string; amount: string }> }} balances
 * @param {string} mint
 */
export const heldAmount = (balances, mint) =>
  BigInt(
    mint === WSOL
      ? balances.lamports
      : (balances.tokens.find((token) => token.mint === mint)?.amount ?? "0"),
  );

/** @param {SwapPair} pair @param {SwapQaOptions} options @param {bigint} held */
const runPair = async (pair, options, held) => {
  const amount = amountFor(pair, options.amountLamports);
  const base = { name: pair.name, amount: String(amount) };
  if (held < amount) {
    return {
      ...base,
      ...summarise([]),
      skipped: true,
      skipReason: `wallet holds ${held} of the input mint, short of ${amount}`,
    };
  }
  /** @type {Array<{ reason: string; ms: number }>} */
  const attempts = [];
  for (let round = 0; round < options.rounds; round++) attempts.push(await attempt(pair, options));
  return { ...base, ...summarise(attempts), skipped: false };
};

/**
 * Run the sweep and return the validated report.
 * @param {SwapQaOptions} options
 * @returns {Promise<import("./swap-schema.js").SwapQa>}
 */
export const runSwapQa = async (options) => {
  const startedAt = new Date();
  const balances = await Effect.runPromise(withSolos(getBalances(undefined)));
  /** @type {Array<import("./swap-schema.js").SwapPairReport>} */
  const pairs = [];
  for (const pair of SWAP_PAIRS) {
    pairs.push(await runPair(pair, options, heldAmount(balances, pair.inputMint)));
  }
  const attempted = pairs.filter((pair) => !pair.skipped);
  const totals = summarise(
    attempted.flatMap((pair) =>
      pair.outcomes.flatMap(({ reason, count }) =>
        Array.from({ length: count }, () => ({ reason, ms: pair.p50Ms })),
      ),
    ),
  );
  return SwapQaSchema.parse({
    capability: "swap",
    tier: options.tier,
    amountLamports: String(options.amountLamports),
    slippageBps: options.slippageBps,
    rounds: options.rounds,
    threshold: options.threshold,
    // An unfunded pair proves nothing either way, so it cannot pass the run on its own.
    status:
      attempted.length > 0 && totals.rate >= options.threshold
        ? /** @type {const} */ ("passed")
        : /** @type {const} */ ("failed"),
    skippedPairs: pairs.filter((pair) => pair.skipped).map((pair) => pair.name),
    attempts: totals.attempts,
    ok: totals.ok,
    rate: totals.rate,
    p50Ms: Math.round(
      attempted.reduce((sum, pair) => sum + pair.p50Ms, 0) / (attempted.length || 1),
    ),
    p95Ms: Math.max(0, ...attempted.map((pair) => pair.p95Ms)),
    pairs,
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });
};
