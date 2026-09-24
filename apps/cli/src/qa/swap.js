// @ts-check
/**
 * Swap reliability QA. Swap failures are route-dependent: Jupiter picks a different path each
 * call, so one attempt says nothing about whether the CLI can trade. This runs every pair for a
 * fixed number of rounds and reports how often it succeeded and how long it took.
 *
 * `simulate` is the default and never spends. `execute` sends real transactions and is only for
 * an authorised live round (AGENTS.md, Funds), which is why it keeps a signature per attempt.
 */
import { getBalances } from "@solos/core";
import { Effect } from "effect";
import { withSolos } from "../runtime.js";
import { attemptSwap } from "./swap-attempt.js";
import { SWAP_PAIRS, WSOL, amountFor } from "./swap-cases.js";
import { SwapQaOptionsSchema, requiredBalance } from "./swap-options.js";
import { SwapQaSchema } from "./swap-schema.js";
import { percentileMs, summarise } from "./swap-stats.js";

/** @typedef {import("./swap-cases.js").SwapPair} SwapPair */
/** @typedef {import("./swap-options.js").SwapQaOptions} SwapQaOptions */
/** @typedef {import("./swap-attempt.js").Attempt} Attempt */

/**
 * What the wallet holds of one mint, in base units. A pair the wallet cannot fund would fail
 * every round on insufficient funds and read as a broken venue — a reliability report that
 * blames the product for its own setup is worse than none, so those pairs are skipped.
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
  const needed = requiredBalance(amount, options);
  const base = { name: pair.name, amount: String(amount) };
  if (held < needed) {
    const detail = `wallet holds ${held} of the input mint, short of the ${needed} this sweep needs`;
    return { ...base, ...summarise([]), attempts: [], skipped: true, skipReason: detail };
  }
  /** @type {Attempt[]} */
  const attempts = [];
  for (let round = 0; round < options.rounds; round++)
    attempts.push(await attemptSwap(pair, options));
  return { ...base, ...summarise(attempts), attempts, skipped: false };
};

/** @param {Array<{ attempts: Attempt[]; skipped: boolean }>} pairs */
const receiptsOf = (pairs) =>
  pairs
    .flatMap(({ attempts }) => attempts)
    .flatMap(({ signature, ms, reason }) => (signature ? [{ signature, ms, reason }] : []));

/**
 * Run the sweep and return the validated report.
 * @param {SwapQaOptions} rawOptions
 * @returns {Promise<import("./swap-schema.js").SwapQa>}
 */
export const runSwapQa = async (rawOptions) => {
  // Before the first provider call: an unsatisfiable option must not cost a single send.
  const options = SwapQaOptionsSchema.parse(rawOptions);
  const startedAt = new Date();
  const balances = await Effect.runPromise(withSolos(getBalances(undefined)));
  const pairs = [];
  for (const pair of SWAP_PAIRS) {
    pairs.push(await runPair(pair, options, heldAmount(balances, pair.inputMint)));
  }
  const attempted = pairs.filter((pair) => !pair.skipped);
  const every = attempted.flatMap(({ attempts }) => attempts);
  const totals = summarise(every);
  const durations = every.map(({ ms }) => ms);
  return SwapQaSchema.parse({
    capability: "swap",
    tier: options.tier,
    amountLamports: String(options.amountLamports),
    slippageBps: options.slippageBps,
    rounds: options.rounds,
    threshold: options.threshold,
    // An unfunded pair proves nothing either way, so it cannot pass the run on its own.
    status: attempted.length > 0 && totals.rate >= options.threshold ? "passed" : "failed",
    skippedPairs: pairs.filter((pair) => pair.skipped).map((pair) => pair.name),
    attempts: totals.attempts,
    ok: totals.ok,
    rate: totals.rate,
    // Percentiles over every attempt, not over the per-pair summaries: the mean of medians and
    // the max of p95s are neither of them a percentile of the run.
    p50Ms: percentileMs(durations, 0.5),
    p95Ms: percentileMs(durations, 0.95),
    receipts: receiptsOf(pairs),
    // Per-attempt records stay out of the report; their signatures ride in `receipts` and their
    // durations are already folded into the percentiles above.
    pairs: pairs.map((pair) => ({ ...pair, attempts: pair.attempts.length })),
    startedAt: startedAt.toISOString(),
    durationMs: Date.now() - startedAt.getTime(),
  });
};
