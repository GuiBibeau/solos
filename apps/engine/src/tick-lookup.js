// @ts-check
import { IntentLookup } from "@solos/core/strategy";
import { Effect, Layer } from "effect";

/**
 * Intent rows after startup recovery has already looked signatures up.
 * @param {import("bun:sqlite").Database} db
 */
export const engineIntentLookup = (db) =>
  Layer.sync(IntentLookup, () => ({
    lookup: (intentId) => Effect.sync(() => lookupRow(db, intentId)),
  }));

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 */
const lookupRow = (db, intentId) => {
  const row = db
    .query("SELECT state, signature, payload FROM intents WHERE intent_id = ?")
    .get(intentId);
  if (row === null) return { state: /** @type {const} */ ("missing") };
  return shaped(/** @type {IntentSql} */ (row));
};

/**
 * @typedef {{ state: string; signature: string | null; payload: string | null }} IntentSql
 * @param {IntentSql} row
 */
const shaped = (row) => {
  if (row.state === "settled")
    return { state: /** @type {const} */ ("settled"), signature: row.signature };
  if (row.state === "failed") {
    return {
      state: /** @type {const} */ ("failed"),
      signature: row.signature,
      reason: reasonOf(row.payload),
    };
  }
  return { state: /** @type {const} */ ("in_flight"), signature: row.signature };
};

/** @param {string | null} payload */
const reasonOf = (payload) => {
  if (payload === null) return "intent failed";
  const body = JSON.parse(payload);
  if (typeof body === "object" && body !== null && "reason" in body) {
    const reason = /** @type {{ reason?: unknown }} */ (body).reason;
    return typeof reason === "string" ? reason : "intent failed";
  }
  return "intent failed";
};
