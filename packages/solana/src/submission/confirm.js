// @ts-check
/**
 * Deliver sealed bytes through a Submitter and wait until they land, fail, or the deadline
 * passes. Every Submitter gets the same guarantees because this loop, not the adapter, decides
 * when to stop: a send that errors is looked up once before anything is concluded, a landed
 * execution error is final at once, and silence at the deadline is "may have landed", never
 * "failed", because the bytes may still be in flight. Once bytes may have left, every outcome
 * carries the signature: even an adapter defect ends as "may have landed", so a Caller can
 * always look the transaction up instead of losing it.
 */
import { TransactionFailed } from "@solos/core";
import { Duration, Effect, FiberRef, Schedule } from "effect";
import { signedIntentNote } from "./signed-note.js";

export const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";
export const EXECUTION_FAILED = "the transaction confirmed with an execution error";

/**
 * @typedef {"pending" | "success" | "failed"} ConfirmationState
 * @typedef {import("./mode.js").SubmissionMode["confirmation"]} Confirmation
 * @typedef {import("./submitter.js").SubmitterShape} SubmitterShape
 */

/** @param {unknown} status @param {Confirmation["commitment"]} commitment */
const reached = (status, commitment) => {
  const level = /** @type {{ confirmationStatus?: unknown }} */ (status).confirmationStatus;
  return level === "finalized" || (commitment === "confirmed" && level === "confirmed");
};

/**
 * Read one signature status row: pending until it reaches the commitment, then success or failed.
 * @param {unknown} status
 * @param {Confirmation["commitment"]} [commitment]
 * @returns {ConfirmationState}
 */
export const confirmationState = (status, commitment = "confirmed") => {
  if (status === null || typeof status !== "object") return "pending";
  if (!reached(status, commitment)) return "pending";
  const { err } = /** @type {{ err?: unknown }} */ (status);
  return err === null || err === undefined ? "success" : "failed";
};

/** @param {import("@solana/kit").Signature} signature */
const mayHaveLanded = (signature) => new TransactionFailed({ signature, reason: MAY_HAVE_LANDED });

/** @param {SubmitterShape} submitter @param {import("@solana/kit").Signature} signature @param {Confirmation["commitment"]} commitment */
const hasLanded = (submitter, signature, commitment) =>
  Effect.flatMap(submitter.status(signature), (status) => {
    const state = confirmationState(status, commitment);
    if (state === "failed")
      return Effect.fail(new TransactionFailed({ signature, reason: EXECUTION_FAILED }));
    return Effect.succeed(state === "success");
  });

/**
 * A Submitter's own TransactionFailed is final. Any other send error is ambiguous — the bytes
 * may have reached a leader before the transport broke — so it is resolved by one lookup.
 * @param {SubmitterShape} submitter @param {import("./sealed.js").Sealed} sealed @param {Confirmation["commitment"]} commitment
 */
const sendOrRecover = (submitter, sealed, commitment) =>
  submitter
    .send(sealed)
    .pipe(
      Effect.catchAll((error) =>
        error instanceof TransactionFailed
          ? Effect.fail(error)
          : Effect.flatMap(hasLanded(submitter, sealed.signature, commitment), (isLanded) =>
              isLanded ? Effect.void : Effect.fail(mayHaveLanded(sealed.signature)),
            ),
      ),
    );

/**
 * @param {SubmitterShape} submitter
 * @param {import("./sealed.js").Sealed} sealed
 * @param {Confirmation} confirmation
 * @returns {Effect.Effect<import("@solana/kit").Signature, TransactionFailed>}
 */
export const confirmDelivery = (submitter, sealed, confirmation) =>
  Effect.gen(function* () {
    const note = yield* FiberRef.get(signedIntentNote);
    if (note !== undefined) note(sealed);
    yield* sendOrRecover(submitter, sealed, confirmation.commitment);
    yield* Effect.repeat(hasLanded(submitter, sealed.signature, confirmation.commitment), {
      schedule: Schedule.spaced(Duration.millis(confirmation.pollMs)),
      until: (/** @type {boolean} */ isLanded) => isLanded,
    });
    return sealed.signature;
  }).pipe(
    Effect.timeoutFail({
      duration: Duration.millis(confirmation.deadlineMs),
      onTimeout: () => mayHaveLanded(sealed.signature),
    }),
    Effect.mapError((error) =>
      error instanceof TransactionFailed ? error : mayHaveLanded(sealed.signature),
    ),
    Effect.catchAllDefect(() => Effect.fail(mayHaveLanded(sealed.signature))),
    Effect.withSpan("submission.deliver", { attributes: { submitter: submitter.name } }),
  );
