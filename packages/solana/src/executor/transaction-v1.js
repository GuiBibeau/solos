// @ts-check
/**
 * The two v1 boundaries: the last check before a signer is involved, and the last before wire
 * bytes touch RPC. The clauses each one refuses with live in `transaction-v1-clauses.js`.
 */
import {
  compileTransactionMessage,
  createTransactionMessage,
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  getTransactionMessageSize,
  setTransactionMessageConfig,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import {
  COMPUTE_BUDGET_PROGRAM,
  MAX_TRANSACTION_ACCOUNTS,
  MAX_TRANSACTION_BYTES,
  PRESIGN_REASON,
  PRESUBMIT_REASON,
  assertConfig,
  clause,
  kitAccountCount,
  notV1,
  overByteCeiling,
  tooManyAccounts,
  withClause,
} from "./transaction-v1-clauses.js";

export {
  MAX_PRIORITY_FEE_LAMPORTS,
  MAX_TRANSACTION_ACCOUNTS,
  MAX_TRANSACTION_BYTES,
  V1_SIGNING_FAILED,
  V1_UNKNOWN_CLAUSE,
  rejectionAfterV1Policy,
} from "./transaction-v1-clauses.js";

/**
 * The only production v1 message constructor. Callers choose bounded local policy values;
 * provider instructions and values never reach this boundary.
 * @param {{
 *   feePayerSigner: import("../signer/kit-signer.js").KitCompatibleSigner;
 *   config: import("@solana/kit").V1TransactionConfig;
 * }} options
 */
export const beginV1Message = ({ feePayerSigner, config }) => {
  assertConfig(config, PRESIGN_REASON);
  return setTransactionMessageConfig(
    config,
    setTransactionMessageFeePayerSigner(feePayerSigner, createTransactionMessage({ version: 1 })),
  );
};

/**
 * @param {ReturnType<typeof compileTransactionMessage>} compiled
 * @param {import("@solana/kit").ReadonlyUint8Array} bytes
 */
const assertCompiledBounds = (compiled, bytes) => {
  if (compiled.version !== 1 || bytes[0] !== 0x81) throw notV1(compiled.version, bytes[0]);
  if (compiled.staticAccounts.length > MAX_TRANSACTION_ACCOUNTS) {
    throw tooManyAccounts(compiled.staticAccounts.length);
  }
};

/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const assertV1MessageForSigning = (message) => {
  try {
    if (message.version !== 1) throw notV1(message.version, undefined);
    assertConfig(message.config ?? {}, PRESIGN_REASON);
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw clause("a compute budget instruction reached the v1 boundary");
    // Kit throws its own account-ceiling error here; translate it, keeping only its count.
    const compiled = (() => {
      try {
        return compileTransactionMessage(message);
      } catch (error) {
        throw tooManyAccounts(kitAccountCount(error));
      }
    })();
    const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
    assertCompiledBounds(compiled, bytes);
    const size = getTransactionMessageSize(message);
    if (size > MAX_TRANSACTION_BYTES) throw overByteCeiling(size);
    return { compiled, bytes };
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    throw new BuildRejected({ reason: withClause(PRESIGN_REASON, error) });
  }
};

/** Assert immediately before signer invocation. */
/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const signV1Message = async (message) => {
  assertV1MessageForSigning(message);
  return await signTransactionMessageWithSigners(message);
};

/**
 * Decode the wire and prove its shape: within the byte ceiling, a v1 message by both the decoded
 * field and the prefix byte, and within the account ceiling. That last check was missing here
 * while the pre-signing boundary enforced it, so a wire reaching RPC by any other route went out
 * over the ceiling with the clause never evaluated.
 * @param {string} wireBase64
 */
const compiledFromWire = (wireBase64) => {
  const wire = getBase64Codec().encode(wireBase64);
  if (wire.length > MAX_TRANSACTION_BYTES) throw overByteCeiling(wire.length);
  const transaction = getTransactionDecoder().decode(wire);
  const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  if (compiled.version !== 1 || transaction.messageBytes[0] !== 0x81) {
    throw notV1(compiled.version, transaction.messageBytes[0]);
  }
  if (compiled.staticAccounts.length > MAX_TRANSACTION_ACCOUNTS) {
    throw tooManyAccounts(compiled.staticAccounts.length);
  }
  return compiled;
};

/** @param {string} wireBase64 */
export const assertV1WireForSubmission = (wireBase64) => {
  try {
    const compiled = compiledFromWire(wireBase64);
    const message = decompileTransactionMessage(compiled);
    assertConfig(message.config ?? {}, PRESUBMIT_REASON);
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw clause("a compute budget instruction reached the v1 boundary");
    return compiled;
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    throw new BuildRejected({ reason: withClause(PRESUBMIT_REASON, error) });
  }
};
