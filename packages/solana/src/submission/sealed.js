// @ts-check
/**
 * The first step of Submission (ADR-0031): prove the exact bytes are a v1 transaction with a
 * blockhash lifetime before anything touches RPC, and keep what the later steps need.
 */
import {
  getBase64EncodedWireTransaction,
  getSignatureFromTransaction,
  isTransactionWithBlockhashLifetime,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { assertV1WireForSubmission } from "../executor/transaction-v1.js";

export const ENCODING_FAILED = "transaction encoding failed before RPC; nothing was sent";
export const BLOCKHASH_LIFETIME_ONLY =
  "only a transaction with a blockhash lifetime can be submitted; nothing was sent";

/**
 * @typedef {Awaited<ReturnType<typeof import("../executor/transaction-v1.js").signV1Message>>} Signed
 * @typedef {{
 *   readonly wire: import("@solana/kit").Base64EncodedWireTransaction;
 *   readonly signature: import("@solana/kit").Signature;
 *   readonly lastValidBlockHeight: bigint;
 * }} Sealed
 */

/**
 * @param {Signed} signed
 * @returns {Effect.Effect<Sealed, BuildRejected>}
 */
export const seal = (signed) =>
  Effect.try({
    try: () => {
      const wire = getBase64EncodedWireTransaction(signed);
      assertV1WireForSubmission(wire);
      if (!isTransactionWithBlockhashLifetime(signed))
        throw new BuildRejected({ reason: BLOCKHASH_LIFETIME_ONLY });
      return {
        wire,
        signature: getSignatureFromTransaction(signed),
        lastValidBlockHeight: signed.lifetimeConstraint.lastValidBlockHeight,
      };
    },
    catch: (error) =>
      error instanceof BuildRejected ? error : new BuildRejected({ reason: ENCODING_FAILED }),
  });
