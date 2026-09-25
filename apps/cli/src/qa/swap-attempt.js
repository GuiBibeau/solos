// @ts-check
/** One swap attempt and the outcome key it records. */
import { executeSwap, simulateSwap } from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { withSolos } from "../runtime.js";
import { amountFor } from "./swap-cases.js";

/** @typedef {import("./swap-cases.js").SwapPair} SwapPair */
/** @typedef {import("./swap-options.js").SwapQaOptions} SwapQaOptions */
/** @typedef {{ reason: string; ms: number; signature?: string }} Attempt */

/** A trailing parenthetical is the clause that names which bound refused (#124). */
const TRAILING_CLAUSE = /\(([^()]+)\)\s*$/;

/**
 * The part of a reason worth recording.
 *
 * This used to collapse digits and take the first 60 characters. Both were doing the tally's
 * job, and both destroyed the thing worth keeping: every v1 policy refusal begins with the same
 * 62-character sentence, so two different clauses truncated to the *identical* row and the
 * report showed one anonymous bucket — the very symptom #116 reported and #124 set out to end.
 *
 * So when a reason ends in a clause, the clause is the identity and rides through with its
 * numbers intact. Grouping is `tallyOutcomes`'s concern, not this one.
 * @param {string} reason
 */
const shortReason = (reason) => {
  const collapsed = reason.replaceAll(/\s+/g, " ").trim();
  return (TRAILING_CLAUSE.exec(collapsed)?.[1] ?? collapsed).slice(0, 120);
};

/**
 * A stable, groupable outcome key. The tag alone is too coarse to act on — `SimulationFailed`
 * covers both a spend-bound refusal and a chain rejection, which call for opposite responses —
 * so a bounded slice of the reason rides along.
 * @param {unknown} error
 */
export const reasonOf = (error) => {
  const failure = /** @type {{ _tag?: unknown; code?: unknown; reason?: unknown }} */ (error);
  const named = [failure?._tag, failure?.code].find((value) => typeof value === "string");
  const tag = named ?? "Unknown";
  if (typeof failure?.reason !== "string" || failure.reason.length === 0) return tag;
  return `${tag}: ${shortReason(failure.reason)}`;
};

/**
 * The outcome of a simulation that returned rather than failed. `ok: false` carries the chain's
 * own rejection in `violations`; collapsing those to one bucket would hide exactly the
 * route-dependent differences this command exists to surface.
 * @param {{ ok?: boolean; violations?: ReadonlyArray<{ rule?: string; message?: string }> }} value
 */
export const simulationReason = (value) => {
  if (value?.ok !== false) return "ok";
  const violation = value.violations?.[0];
  if (!violation?.message) return "SimulationRejected";
  return `SimulationRejected: ${shortReason(violation.message)}`;
};

/**
 * One attempt against one pair. A failure is recorded, never thrown: the run's product is the
 * distribution of outcomes, so one bad route must not end the sweep.
 * @param {SwapPair} pair @param {SwapQaOptions} options @returns {Promise<Attempt>}
 */
export const attemptSwap = async (pair, options) => {
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
    const value = /** @type {{ ok?: boolean; signature?: string }} */ (exit.value);
    // An execute that returns has landed; its signature is the receipt the operator needs.
    if (options.tier === "execute") return { reason: "ok", ms, signature: value.signature };
    return { reason: simulationReason(value), ms };
  }
  return { reason: reasonOf(Option.getOrUndefined(Cause.failureOption(exit.cause))), ms };
};
