// @ts-check
import {
  compileTransactionMessage,
  createTransactionMessage,
  decompileTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionMessageSize,
  getTransactionDecoder,
  setTransactionMessageConfig,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";

export const MAX_TRANSACTION_BYTES = 4096;
export const MAX_TRANSACTION_ACCOUNTS = 64;
export const MAX_PRIORITY_FEE_LAMPORTS = 100_000n;
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
const PRESIGN_REASON = "transaction failed v1 policy before signing; nothing was signed";
const PRESUBMIT_REASON = "transaction failed v1 policy before RPC; nothing was sent";

/** @returns {never} */
const rejectBeforeSigning = () => {
  throw new BuildRejected({ reason: PRESIGN_REASON });
};

/** @param {number | undefined} value */
const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && (value ?? 0) > 0;

/** @param {import("@solana/kit").V1TransactionConfig} config */
const assertConfig = (config) => {
  if (!isPositiveSafeInteger(config.computeUnitLimit)) rejectBeforeSigning();
  if (!isPositiveSafeInteger(config.loadedAccountsDataSizeLimit)) rejectBeforeSigning();
  const priorityFeeLamports = config.priorityFeeLamports;
  if (
    priorityFeeLamports === undefined ||
    priorityFeeLamports < 0n ||
    priorityFeeLamports > MAX_PRIORITY_FEE_LAMPORTS
  )
    rejectBeforeSigning();
};

/**
 * The only production v1 message constructor. Callers choose bounded local policy values;
 * provider instructions and values never reach this boundary.
 * @param {{
 *   feePayerSigner: import("../signer/kit-signer.js").KitCompatibleSigner;
 *   config: import("@solana/kit").V1TransactionConfig;
 * }} options
 */
export const beginV1Message = ({ feePayerSigner, config }) => {
  assertConfig(config);
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
  if (compiled.version !== 1 || bytes[0] !== 0x81) throw new Error("version");
  if (compiled.staticAccounts.length > MAX_TRANSACTION_ACCOUNTS) throw new Error("accounts");
};

/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const assertV1MessageForSigning = (message) => {
  try {
    if (message.version !== 1) throw new Error("wrong version");
    assertConfig(message.config ?? {});
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw new Error("compute budget instruction");
    const compiled = compileTransactionMessage(message);
    const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
    assertCompiledBounds(compiled, bytes);
    if (getTransactionMessageSize(message) > MAX_TRANSACTION_BYTES) throw new Error("bytes");
    return { compiled, bytes };
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    throw new BuildRejected({ reason: PRESIGN_REASON });
  }
};

/** Assert immediately before signer invocation. */
/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const signV1Message = async (message) => {
  assertV1MessageForSigning(message);
  return await signTransactionMessageWithSigners(message);
};

/** @param {string} wireBase64 */
export const assertV1WireForSubmission = (wireBase64) => {
  try {
    const wire = getBase64Codec().encode(wireBase64);
    if (wire.length > MAX_TRANSACTION_BYTES) throw new Error("bytes");
    const transaction = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (compiled.version !== 1 || transaction.messageBytes[0] !== 0x81) throw new Error("version");
    const message = decompileTransactionMessage(compiled);
    assertConfig(message.config ?? {});
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw new Error("compute budget instruction");
    return compiled;
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    throw new BuildRejected({ reason: PRESUBMIT_REASON });
  }
};
