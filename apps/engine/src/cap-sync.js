// @ts-check
import { CapLedger } from "@solos/core";
import { Effect } from "effect";
import { hasCapTables, holdByIntent, listOpenHolds } from "./cap-ledger-store.js";
import { readIntent } from "./intents.js";
import { paidFeeUsd } from "./paid-fee.js";

/** @typedef {{ db: import("bun:sqlite").Database; runtime: import("./http.js").EngineDeps["runtime"]; caps?: boolean }} HoldDeps */
/** @typedef {import("./cap-ledger-store.js").CapRow} CapRow */
/** @typedef {{ kind: "release" } | { kind: "settled"; status: string }} CallerOutcome */
/** @typedef {{ kind: "release" } | { kind: "settled"; amountUsd: string }} HoldOutcome */

/**
 * After intents are recovered, open holds follow the stored outcome. An in-flight Intent keeps
 * its hold. A confirmed transfer settles its reserved notional. A landed execution error
 * settles the fee the transaction paid. A failed Intent releases once.
 * @param {HoldDeps} deps
 */
export const syncHolds = async (deps) => {
  if (!ready(deps)) return;
  for (const hold of listOpenHolds(deps.db)) await syncRow(deps, hold);
};

/** @param {HoldDeps} deps @param {string} intentId */
export const syncHold = async (deps, intentId) => {
  if (!ready(deps)) return;
  const hold = holdByIntent(deps.db, intentId);
  if (hold === undefined || hold.status !== "open") return;
  await syncRow(deps, hold);
};

/**
 * Apply an outcome the caller already knows, before the Intent row is updated.
 * @param {HoldDeps} deps
 * @param {string} intentId
 * @param {CallerOutcome} outcome
 */
export const applyHoldOutcome = async (deps, intentId, outcome) => {
  if (!ready(deps)) return;
  const hold = holdByIntent(deps.db, intentId);
  if (hold === undefined || hold.status !== "open") return;
  const recorded = recordedOutcome(hold, outcome);
  if (recorded === undefined) return;
  await commit(deps, hold, recorded);
};

/** @param {HoldDeps} deps */
const ready = (deps) => deps.caps === true && hasCapTables(deps.db);

/** @param {HoldDeps} deps @param {CapRow} hold */
const syncRow = async (deps, hold) => {
  const intent = readIntent(deps.db, hold.intent_id);
  if (intent.state === "in_flight" || intent.state === "missing") return;
  if (intent.state === "failed") {
    await commit(deps, hold, { kind: "release" });
    return;
  }
  await settleLandedHold(deps, hold, intent);
};

/**
 * @param {HoldDeps} deps
 * @param {CapRow} hold
 * @param {ReturnType<typeof readIntent>} intent
 */
const settleLandedHold = async (deps, hold, intent) => {
  if (statusOf(intent) === "confirmed") {
    await commit(deps, hold, { kind: "settled", amountUsd: hold.notional_usd });
    return;
  }
  const signature = signatureOf(intent);
  if (signature === undefined) return;
  const amountUsd = await deps.runtime.runPromise(paidFeeUsd(signature));
  if (amountUsd === undefined) return;
  await commit(deps, hold, { kind: "settled", amountUsd });
};

/** @param {ReturnType<typeof readIntent>} intent */
const statusOf = (intent) => {
  if (intent.state !== "settled") return "failed";
  const status = /** @type {{ status?: unknown }} */ (intent.result)?.status;
  return typeof status === "string" ? status : "failed";
};

/** @param {ReturnType<typeof readIntent>} intent */
const signatureOf = (intent) => {
  if (intent.state !== "settled") return undefined;
  const signature = /** @type {{ signature?: unknown }} */ (intent.result)?.signature;
  return typeof signature === "string" && signature.length > 0 ? signature : undefined;
};

/**
 * A confirmed transfer settles the reserved notional. Any other status is a landed execution
 * error, priced later from `meta.fee`, never as zero.
 * @param {CapRow} hold
 * @param {CallerOutcome} outcome
 * @returns {HoldOutcome | undefined}
 */
const recordedOutcome = (hold, outcome) => {
  if (outcome.kind === "release") return outcome;
  if (outcome.status !== "confirmed") return undefined;
  return { kind: "settled", amountUsd: hold.notional_usd };
};

/**
 * @param {HoldDeps} deps
 * @param {CapRow} hold
 * @param {HoldOutcome} outcome
 */
const commit = (deps, hold, outcome) => deps.runtime.runPromise(commitEffect(hold, outcome));

/**
 * @param {CapRow} hold
 * @param {HoldOutcome} outcome
 */
const commitEffect = (hold, outcome) =>
  Effect.flatMap(CapLedger, (ledger) =>
    outcome.kind === "release"
      ? ledger.release(hold.reservation_id)
      : ledger.settle(hold.reservation_id, outcome.amountUsd),
  );
