// @ts-check
import {
  compileTransactionMessage,
  createTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  setTransactionMessageConfig,
  setTransactionMessageFeePayerSigner,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";

/**
 * The repo's single transaction-v1 construction and enforcement boundary, in the adapter layer
 * so Kit never crosses into core (ADR-0005). Every execute-tier action assembles through
 * `beginV1Message`; the version is asserted twice — on the compiled message before any signer
 * is involved, and on the signed wire before anything reaches the RPC transport. Legacy and v0
 * are refused with fixed reasons: no fallback, no rebuild, no signature, no network contact.
 */

/** Fixed pre-sign refusal: the message was not v1, so no signature was ever produced. */
const PRESIGN_REASON = "transaction message was not v1 before signing; nothing was signed";
/** Fixed pre-submit refusal: the wire was not v1, so nothing reached the transport. */
const PRESUBMIT_REASON = "transaction wire was not v1 before submission; nothing was sent";

/**
 * Begin a v1 message with the fee payer attached as the keychain signer and the explicit local
 * resource policy. Provider budget instructions are never carried into v1 messages; the config
 * is the whole policy.
 * @param {{
 *   feePayerSigner: import("../signer/kit-signer.js").KitCompatibleSigner;
 *   config: import("@solana/kit").V1TransactionConfig;
 * }} options
 */
export const beginV1Message = ({ feePayerSigner, config }) =>
  setTransactionMessageConfig(
    config,
    setTransactionMessageFeePayerSigner(feePayerSigner, createTransactionMessage({ version: 1 })),
  );

/**
 * Compiled message bytes asserted to be v1. Call this immediately before signing: a legacy or
 * v0 message is refused here, before any signer is touched.
 * @param {Parameters<typeof compileTransactionMessage>[0]} message
 * @returns {{
 *   compiled: ReturnType<typeof compileTransactionMessage>;
 *   bytes: import("@solana/kit").ReadonlyUint8Array;
 * }}
 */
export const assertV1MessageForSigning = (message) => {
  const compiled = compileTransactionMessage(message);
  if (compiled.version !== 1) throw new BuildRejected({ reason: PRESIGN_REASON });
  return { compiled, bytes: getCompiledTransactionMessageEncoder().encode(compiled) };
};

/**
 * Decode one base64 wire transaction and assert its message is v1. Call this immediately
 * before any RPC contact with the exact bytes: simulation, submission, or both.
 * @param {string} wireBase64
 */
export const assertV1WireForSubmission = (wireBase64) => {
  const transaction = getTransactionDecoder().decode(getBase64Codec().encode(wireBase64));
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (compiled.version !== 1) throw new BuildRejected({ reason: PRESUBMIT_REASON });
  return compiled;
};
