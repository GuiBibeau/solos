// @ts-check
import { errorEnvelope, TransactionExpired, TransactionFailed } from "@solos/core";
import { signatureOutlook } from "@solos/solana";
import { failIntent, inFlightIds, readIntent, settleIntent } from "./intents.js";

const UNSIGNED = "the engine stopped before the transaction was signed; nothing was sent";
const EXPIRED = "the blockhash expired and the signature was not found; a new intent may resend";
const LANDED_ERROR = "the transaction confirmed with an execution error";

/** @typedef {{ db: import("bun:sqlite").Database; runtime: import("./http.js").EngineDeps["runtime"] }} RecoverDeps */
/** @typedef {Extract<ReturnType<typeof readIntent>, { state: "in_flight" }>} InFlight */

/**
 * Every in-flight Intent left by the previous process. No request is signing in this one, so a
 * row with no signature was never broadcast.
 * @param {RecoverDeps} deps
 */
export const recoverIntents = async (deps) => {
  for (const intentId of inFlightIds(deps.db)) {
    const row = readIntent(deps.db, intentId);
    if (row.state !== "in_flight") continue;
    if (row.signature === null) {
      failUnsigned(deps.db, intentId);
      continue;
    }
    await reconcileIntent(deps, intentId);
  }
};

/**
 * Look up a signature that may have landed. RPC silence leaves the row in flight.
 * @param {RecoverDeps} deps
 * @param {string} intentId
 */
export const reconcileIntent = async (deps, intentId) => {
  const row = readIntent(deps.db, intentId);
  if (row.state !== "in_flight" || row.signature === null) return row;
  const outlook = await readOutlook(deps, row.signature);
  if (outlook === undefined) return row;
  return applyOutlook(deps.db, row, outlook);
};

/**
 * @param {RecoverDeps} deps
 * @param {string} signature
 */
const readOutlook = async (deps, signature) => {
  try {
    return await deps.runtime.runPromise(signatureOutlook(signature));
  } catch {
    return undefined;
  }
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {InFlight} row
 * @param {{ readonly confirmation: "pending" | "success" | "failed"; readonly height: bigint }} outlook
 */
const applyOutlook = (db, row, outlook) => {
  if (outlook.confirmation !== "pending") return settleLanded(db, row, outlook.confirmation);
  if (isExpired(outlook.height, row.lastValidBlockHeight)) return failExpired(db, row);
  return row;
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {InFlight} row
 * @param {"success" | "failed"} confirmation
 */
const settleLanded = (db, row, confirmation) => {
  if (row.action === undefined || row.action === null) {
    failIntent(db, row.intentId, {
      code: "InternalError",
      reason: "landed intent has no stored action",
    });
    return readIntent(db, row.intentId);
  }
  settleIntent(db, row.intentId, {
    action: row.action,
    status: confirmation === "success" ? "confirmed" : "failed",
    signature: row.signature,
    executedAt: Date.now(),
    simulated: row.simulated,
    error: confirmation === "success" ? null : LANDED_ERROR,
  });
  return readIntent(db, row.intentId);
};

/** @param {bigint} height @param {string | null} lastValid */
const isExpired = (height, lastValid) => lastValid !== null && height > BigInt(lastValid);

/** @param {import("bun:sqlite").Database} db @param {string} intentId */
const failUnsigned = (db, intentId) => {
  failIntent(db, intentId, envelope(new TransactionFailed({ signature: null, reason: UNSIGNED })));
};

/** @param {import("bun:sqlite").Database} db @param {InFlight} row */
const failExpired = (db, row) => {
  const signature = row.signature ?? "";
  failIntent(db, row.intentId, envelope(new TransactionExpired({ signature, reason: EXPIRED })));
  return readIntent(db, row.intentId);
};

/** @param {TransactionFailed | TransactionExpired} error */
const envelope = (error) =>
  errorEnvelope(error) ?? { code: error._tag, reason: "intent recovery failed" };
