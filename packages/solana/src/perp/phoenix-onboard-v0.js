// @ts-check
import {
  compileTransactionMessage,
  createTransactionMessage,
  getBase64Codec,
  getCompiledTransactionMessageDecoder,
  getCompiledTransactionMessageEncoder,
  getTransactionDecoder,
  setTransactionMessageFeePayerSigner,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";

// The pinned Phoenix builder examples send v0/legacy to its co-signing endpoint.
// This exception is limited to onboarding; all other solOS transactions use v1.
const MAX_V0_BYTES = 1232;
const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
/** @param {string} stage */
const reject = (stage) => {
  throw new BuildRejected({
    reason: `Phoenix v0 enrollment policy failed ${stage}; nothing was sent`,
  });
};

/** @param {import("../signer/kit-signer.js").KitCompatibleSigner} signer */
export const beginPhoenixV0Message = (signer) =>
  setTransactionMessageFeePayerSigner(signer, createTransactionMessage({ version: 0 }));

/** @param {ReturnType<typeof compileTransactionMessage>} compiled @param {import("@solana/kit").ReadonlyUint8Array} bytes */
const assertCompiled = (compiled, bytes) => {
  if (compiled.version !== 0 || bytes[0] !== 0x80) reject("version");
  if (compiled.staticAccounts.length > 64 || bytes.length > MAX_V0_BYTES) reject("bounds");
  if ("addressTableLookups" in compiled && compiled.addressTableLookups?.length)
    reject("address lookup tables");
};

/** @param {Parameters<typeof compileTransactionMessage>[0]} message */
export const assertPhoenixV0MessageForSigning = (message) => {
  try {
    if (message.version !== 0) reject("version");
    if (message.instructions.some((ix) => ix.programAddress === COMPUTE_BUDGET_PROGRAM))
      reject("instructions");
    const compiled = compileTransactionMessage(message);
    assertCompiled(compiled, getCompiledTransactionMessageEncoder().encode(compiled));
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    reject("before signing");
  }
};

/** @param {string} wire */
export const assertPhoenixV0WireForSubmission = (wire) => {
  try {
    const bytes = getBase64Codec().encode(wire);
    if (bytes.length > MAX_V0_BYTES) reject("bounds");
    const transaction = getTransactionDecoder().decode(bytes);
    const compiled = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    assertCompiled(compiled, transaction.messageBytes);
  } catch (error) {
    if (error instanceof BuildRejected) throw error;
    reject("before submission");
  }
};
