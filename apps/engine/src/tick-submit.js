// @ts-check
import { ActionExecutor, PriceFeed, Signer, errorEnvelope, toJsonSafe } from "@solos/core";
import { TickSubmit } from "@solos/core/strategy";
import { SolanaRpc, landedFeeLamports, signedIntentNote } from "@solos/solana";
import { Effect, Layer } from "effect";
import { claimIntent, failIntent, readIntent, recordSigned, settleIntent } from "./intents.js";
import { paidFeeUsd } from "./paid-fee.js";
import { openSwapLedger, runSwapOrExecute } from "./swap-fixture.js";
import { withDetails } from "./tick-result-details.js";
import { scriptedSettle } from "./tick-settle.js";

/**
 * Claim the Intent, sign through the Engine executor, then settle or fail the row.
 * A repeat claim returns the stored row and does not send again.
 * @param {import("bun:sqlite").Database} db
 * @param {import("./swap-fixture.js").SwapFixtureConfig | undefined} [swapFixture]
 * @param {import("./tick-settle.js").SettleAction | undefined} [settleAction]
 */
export const engineTickSubmit = (db, swapFixture, settleAction) =>
  Layer.effect(
    TickSubmit,
    Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      const prices = yield* PriceFeed;
      const rpc = yield* SolanaRpc;
      const ledger =
        swapFixture === undefined ? undefined : openSwapLedger(swapFixture, yield* Signer);
      return {
        submit: (input) => {
          if (settleAction !== undefined) return scriptedSettle(input, settleAction);
          return submitOne(db, { executor, ledger }, input).pipe(
            Effect.provideService(PriceFeed, prices),
            Effect.provideService(SolanaRpc, rpc),
          );
        },
      };
    }),
  );

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ executor: import("@solos/core/shared").ActionExecutorShape; ledger: import("./swap-fixture.js").SwapLedger | undefined }} deps
 * @param {{ intentId: string; action: import("@solos-sh/actions").Action }} input
 */
const submitOne = (db, deps, input) => {
  const claim = claimIntent(db, input.intentId, { action: input.action, simulated: true });
  if (claim.state !== "claimed") return Effect.succeed(stored(claim));
  return send(db, deps, input);
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {{ executor: import("@solos/core/shared").ActionExecutorShape; ledger: import("./swap-fixture.js").SwapLedger | undefined }} deps
 * @param {{ intentId: string; action: import("@solos-sh/actions").Action }} input
 */
const send = (db, deps, input) =>
  runSwapOrExecute(deps.ledger, deps.executor, input).pipe(
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
    const feeLamports = yield* feeText(signature);
    if (signature === null || signature.length === 0 || result.status === "confirmed") {
      return withDetails(settledFee(intentId, signature, feeLamports), result);
    }
    const feeUsd = yield* paidFeeUsd(signature);
    return feeRow(intentId, result, { feeUsd, feeLamports });
  });

/**
 * A known fee settles the hold. An unknown fee stays in flight so recovery can price it.
 * `feeLamports` lets a swap price `meta.fee` at the quote's SOL price.
 * @param {string} intentId
 * @param {import("@solos-sh/actions").ExecutionResult} result
 * @param {{ feeUsd: string | undefined; feeLamports: string | undefined }} fees
 */
const feeRow = (intentId, result, fees) => {
  const signature = result.signature;
  if (fees.feeUsd === undefined && fees.feeLamports === undefined) {
    return openRow(intentId, signature);
  }
  return {
    ...failedRow(intentId, result.error ?? "execution failed", signature),
    ...(fees.feeUsd !== undefined && { feeUsd: fees.feeUsd }),
    ...(fees.feeLamports !== undefined && { feeLamports: fees.feeLamports }),
  };
};

/**
 * @param {string} intentId
 * @param {string | null} signature
 * @param {string | undefined} feeLamports
 */
const settledFee = (intentId, signature, feeLamports) => ({
  intentId,
  state: /** @type {const} */ ("settled"),
  signature,
  ...(feeLamports !== undefined && { feeLamports }),
});

/** @param {string | null} signature */
const feeText = (signature) => {
  if (signature === null || signature.length === 0) return Effect.succeed(undefined);
  return landedFeeLamports(signature).pipe(
    Effect.map((fee) => (fee === undefined ? undefined : fee.toString())),
    Effect.catchAll(() => Effect.succeed(undefined)),
  );
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
  if (body.status === "confirmed") {
    return withDetails(
      { intentId, state: /** @type {const} */ ("settled"), signature: body.signature ?? null },
      body,
    );
  }
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
