// @ts-check
import { ActionExecutor, PriceFeed, errorEnvelope, toJsonSafe } from "@solos/core";
import { TickSubmit } from "@solos/core/strategy";
import { SolanaRpc, signedIntentNote } from "@solos/solana";
import { Effect, Layer } from "effect";
import { claimIntent, failIntent, readIntent, recordSigned, settleIntent } from "./intents.js";
import { paidFeeUsd } from "./paid-fee.js";

/**
 * Claim the Intent, sign through the Engine executor, then settle or fail the row.
 * A repeat claim returns the stored row and does not send again.
 * @param {import("bun:sqlite").Database} db
 */
export const engineTickSubmit = (db) =>
  Layer.effect(
    TickSubmit,
    Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      const prices = yield* PriceFeed;
      const rpc = yield* SolanaRpc;
      return {
        submit: (input) =>
          submitOne(db, executor, input).pipe(
            Effect.provideService(PriceFeed, prices),
            Effect.provideService(SolanaRpc, rpc),
          ),
      };
    }),
  );

/**
 * @param {import("bun:sqlite").Database} db
 * @param {import("@solos/core/shared").ActionExecutorShape} executor
 * @param {{ intentId: string; action: import("@solos-sh/actions").Action }} input
 */
const submitOne = (db, executor, input) => {
  const claim = claimIntent(db, input.intentId, { action: input.action, simulated: true });
  if (claim.state !== "claimed") return Effect.succeed(stored(claim));
  return send(db, executor, input);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {import("@solos/core/shared").ActionExecutorShape} executor
 * @param {{ intentId: string; action: import("@solos-sh/actions").Action }} input
 */
const send = (db, executor, input) =>
  executor.execute(input.action, { skipSimulation: false, intentId: input.intentId }).pipe(
    Effect.locally(signedIntentNote, (sealed) => {
      recordSigned(db, input.intentId, sealed);
    }),
    Effect.match({
      onFailure: (error) => ({ failed: /** @type {const} */ (true), error }),
      onSuccess: (result) => ({ failed: /** @type {const} */ (false), result }),
    }),
    Effect.flatMap((step) =>
      Effect.gen(function* () {
        if (step.failed) return failedSend(db, input.intentId, step.error);
        return yield* landed(db, input.intentId, step.result);
      }),
    ),
  );

/** @param {Exclude<ReturnType<typeof claimIntent>, { state: "claimed" }>} claim */
const stored = (claim) => {
  if (claim.state === "in_flight") return openRow(claim.intentId, claim.signature);
  if (claim.state === "failed") return failedRow(claim.intentId, reasonOf(claim.error));
  if (claim.state === "settled") return settledRow(claim.intentId, claim.result);
  return failedRow(claim.intentId, "intent is missing");
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {import("@solos-sh/actions").ExecutionResult} result
 */
const landed = (db, intentId, result) =>
  Effect.gen(function* () {
    const signature = result.signature;
    if (result.status !== "confirmed" && (signature === null || signature.length === 0)) {
      return failedResult(db, intentId, result);
    }
    settleIntent(db, intentId, toJsonSafe(result));
    if (signature === null || signature.length === 0 || result.status === "confirmed") {
      return { intentId, state: /** @type {const} */ ("settled"), signature };
    }
    const feeUsd = yield* paidFeeUsd(signature);
    return feeRow(intentId, result, feeUsd);
  });

/**
 * A known fee settles the hold. An unknown fee stays in flight so recovery can price it.
 * @param {string} intentId
 * @param {import("@solos-sh/actions").ExecutionResult} result
 * @param {string | undefined} feeUsd
 */
const feeRow = (intentId, result, feeUsd) => {
  const signature = result.signature;
  if (feeUsd === undefined) return openRow(intentId, signature);
  return { ...failedRow(intentId, result.error ?? "execution failed", signature), feeUsd };
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {import("@solos-sh/actions").ExecutionResult} result
 */
const failedResult = (db, intentId, result) => {
  const reason = result.error ?? "execution failed";
  failIntent(db, intentId, { code: "TransactionFailed", reason, remedy: "inspect the signature" });
  return failedRow(intentId, reason, result.signature);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {string} intentId
 * @param {unknown} error
 */
const failedSend = (db, intentId, error) => {
  const row = readIntent(db, intentId);
  if (row.state === "in_flight" && row.signature !== null) return openRow(intentId, row.signature);
  const envelope = errorEnvelope(error) ?? {
    code: "InternalError",
    reason: "tick execution failed",
    remedy: "inspect the engine log",
  };
  failIntent(db, intentId, envelope);
  return failedRow(intentId, text(envelope.reason, "tick execution failed"), null);
};

/** @param {string} intentId @param {string | null} signature */
const openRow = (intentId, signature) => ({
  intentId,
  state: /** @type {const} */ ("in_flight"),
  signature,
});

/**
 * @param {string} intentId
 * @param {string} reason
 * @param {string | null} [signature]
 */
const failedRow = (intentId, reason, signature = null) => ({
  intentId,
  state: /** @type {const} */ ("failed"),
  ...(signature !== undefined && signature !== null && { signature }),
  reason,
  remedy: "inspect the signature",
});

/** @param {string} intentId @param {unknown} result */
const settledRow = (intentId, result) => {
  const body =
    /** @type {{ status?: string; signature?: string | null; error?: string | null }} */ (
      result ?? {}
    );
  if (body.status === "confirmed")
    return { intentId, state: /** @type {const} */ ("settled"), signature: body.signature ?? null };
  return failedRow(intentId, body.error ?? "execution failed", body.signature ?? null);
};

/** @param {unknown} error */
const reasonOf = (error) => {
  if (typeof error === "object" && error !== null && "reason" in error) {
    return text(/** @type {{ reason?: unknown }} */ (error).reason, "intent failed");
  }
  return "intent failed";
};

/** @param {unknown} value @param {string} fallback */
const text = (value, fallback) =>
  typeof value === "string" && value.length > 0 ? value : fallback;
