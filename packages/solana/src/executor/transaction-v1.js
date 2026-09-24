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

/**
 * Which clause failed, appended to the fixed reason. Flattening every breach into one sentence
 * meant a refused build named nothing an operator could act on — a heavy route over the account
 * ceiling read exactly like a malformed config (#116).
 *
 * Only our own clauses travel. A library error caught here keeps the bare reason: Kit's messages
 * are more specific but they are not ours to promise, and a fixed vocabulary is what lets a
 * caller match on a reason at all.
 * @param {string} text
 */
const clause = (text) => Object.assign(new Error(text), { solosClause: true });

/** @param {string} base @param {unknown} error */
const withClause = (base, error) =>
  /** @type {{ solosClause?: boolean }} */ (error)?.solosClause === true
    ? `${base} (${/** @type {Error} */ (error).message})`
    : base;

/** @param {string} clause @returns {never} */
const rejectBeforeSigning = (clause) => {
  throw new BuildRejected({ reason: `${PRESIGN_REASON} (${clause})` });
};

/** @param {number | undefined} value */
const isPositiveSafeInteger = (value) => Number.isSafeInteger(value) && (value ?? 0) > 0;

/** @param {import("@solana/kit").V1TransactionConfig} config */
const assertConfig = (config) => {
  if (!isPositiveSafeInteger(config.computeUnitLimit)) rejectBeforeSigning("compute unit limit");
  if (!isPositiveSafeInteger(config.loadedAccountsDataSizeLimit)) {
    rejectBeforeSigning("loaded accounts data size limit");
  }
  const priorityFeeLamports = config.priorityFeeLamports;
  if (
    priorityFeeLamports === undefined ||
    priorityFeeLamports < 0n ||
    priorityFeeLamports > MAX_PRIORITY_FEE_LAMPORTS
  )
    rejectBeforeSigning("priority fee");
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
  if (compiled.version !== 1 || bytes[0] !== 0x81) throw clause("not a v1 message");
  if (compiled.staticAccounts.length > MAX_TRANSACTION_ACCOUNTS) throw tooManyAccounts();
};

/** Kit refuses this before we can count, so both paths answer with one clause of ours. */
const tooManyAccounts = () =>
  clause(`more unique accounts than the ${MAX_TRANSACTION_ACCOUNTS} a v1 message allows`);

/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const assertV1MessageForSigning = (message) => {
  try {
    if (message.version !== 1) throw clause("not a v1 message");
    assertConfig(message.config ?? {});
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw clause("a compute budget instruction reached the v1 boundary");
    // Kit throws its own account-ceiling error here; translate it rather than let it travel.
    const compiled = (() => {
      try {
        return compileTransactionMessage(message);
      } catch {
        throw tooManyAccounts();
      }
    })();
    const bytes = getCompiledTransactionMessageEncoder().encode(compiled);
    assertCompiledBounds(compiled, bytes);
    if (getTransactionMessageSize(message) > MAX_TRANSACTION_BYTES)
      throw clause("serialized size over the v1 byte ceiling");
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

/** @param {string} wireBase64 */
export const assertV1WireForSubmission = (wireBase64) => {
  try {
    const wire = getBase64Codec().encode(wireBase64);
    if (wire.length > MAX_TRANSACTION_BYTES)
      throw clause("serialized size over the v1 byte ceiling");
    const transaction = getTransactionDecoder().decode(wire);
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    if (compiled.version !== 1 || transaction.messageBytes[0] !== 0x81)
      throw clause("not a v1 message");
    const message = decompileTransactionMessage(compiled);
    assertConfig(message.config ?? {});
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      throw clause("a compute budget instruction reached the v1 boundary");
    return compiled;
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    throw new BuildRejected({ reason: withClause(PRESUBMIT_REASON, error) });
  }
};
