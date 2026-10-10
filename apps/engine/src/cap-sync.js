// @ts-check
import { CapLedger } from "@solos/core";
import { Effect } from "effect";
import { hasCapTables, holdByIntent, listOpenHolds } from "./cap-ledger-store.js";
import { readIntent } from "./intents.js";

/** @typedef {{ db: import("bun:sqlite").Database; runtime: import("./http.js").EngineDeps["runtime"]; caps?: boolean }} HoldDeps */
/** @typedef {import("./cap-ledger-store.js").CapRow} CapRow */
/** @typedef {{ kind: "release" } | { kind: "settled"; status: string }} HoldOutcome */

/**
 * After intents are recovered, open holds follow the stored outcome. An in-flight Intent keeps
 * its hold. A landed Intent settles once. A failed Intent releases once.
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
 * @param {HoldOutcome} outcome
 */
export const applyHoldOutcome = async (deps, intentId, outcome) => {
  if (!ready(deps)) return;
  const hold = holdByIntent(deps.db, intentId);
  if (hold === undefined || hold.status !== "open") return;
  await commit(deps, hold, outcome);
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
  const status = typeof intent.result?.status === "string" ? intent.result.status : "failed";
  await commit(deps, hold, { kind: "settled", status });
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
      : ledger.settle(
          hold.reservation_id,
          outcome.status === "confirmed" ? hold.notional_usd : "0",
        ),
  );
