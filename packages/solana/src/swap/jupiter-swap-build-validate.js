// @ts-check
import { getBase64Codec } from "@solana/kit";
import { BASE_UNITS, POSITIVE_BASE_UNITS } from "./jupiter-swap-quote.js";
import { toleranceRejection } from "./jupiter-swap-tolerance.js";

/**
 * Semantic validation of one Jupiter V2 build against the exact Action intent, before anything
 * is signed. Program allowlist: ComputeBudget `setComputeUnitPrice` only, ATA/Token setup,
 * System transfer only to fund the taker's own wSOL account, the JUP6 aggregator swap, and a
 * Token `closeAccount` cleanup. Every account marked as a required signer must be the taker.
 * Every check returns a fixed reason string; no provider text travels into errors. Amounts are
 * compared with BigInt, never a JS Number.
 */

export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const JUP6_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

const TOKEN_PROGRAMS = new Set([TOKEN_PROGRAM, TOKEN_2022_PROGRAM]);
/** Instruction discriminators (first data byte) of the allowlisted instructions. */
const SET_COMPUTE_UNIT_PRICE = 3;
const ATA_CREATE_IDEMPOTENT = 1;
const CLOSE_ACCOUNT = 9;
const SYSTEM_TRANSFER = 2;

/** @param {string} base64 @returns {import("@solana/kit").ReadonlyUint8Array} */
export const dataBytes = (base64) => getBase64Codec().encode(base64);

/**
 * Echo checks hold the provider to the exact requested pair, amount, and tolerance.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 */
export const echoRejection = (envelope, action) => {
  if (envelope.inputMint !== action.inputMint || envelope.outputMint !== action.outputMint) {
    return "echoed mints did not match the requested pair";
  }
  if (envelope.inAmount !== action.amount) {
    return "echoed inAmount did not match the requested amount";
  }
  if (envelope.slippageBps !== action.maxSlippageBps) {
    return "echoed slippageBps did not match the requested tolerance";
  }
  if (envelope.swapMode !== "ExactIn") return "response was not an ExactIn swap";
  return undefined;
};

/**
 * The minimum output is never fabricated and must sit inside the same BigInt tolerance bound
 * the quote face enforces: floor(out × (10000−bps)/10000) ≤ threshold ≤ out.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const minOutRejection = (envelope) => {
  if (envelope.otherAmountThreshold === undefined) {
    return "response had no otherAmountThreshold; the minimum output is never fabricated";
  }
  if (!POSITIVE_BASE_UNITS.test(envelope.outAmount)) {
    return "response outAmount was not a positive integer base-unit string";
  }
  if (!BASE_UNITS.test(envelope.otherAmountThreshold)) {
    return "response otherAmountThreshold was not a base-unit integer string";
  }
  if (BigInt(envelope.otherAmountThreshold) > BigInt(envelope.outAmount)) {
    return "minimum output exceeded the quoted output";
  }
  return toleranceRejection(/** @type {any} */ (envelope));
};

/**
 * Every allowlisted program and instruction discriminator. Compute budget instructions must be
 * `setComputeUnitPrice` (never `setComputeUnitLimit`: the limit is ours); setup may create the
 * taker's accounts idempotently; cleanup may only close the taker's token account.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const programRejection = (envelope) => {
  if (envelope.computeBudgetInstructions.some((ix) => !isPriceInstruction(ix))) {
    return "compute budget instructions may only set a compute unit price";
  }
  if (envelope.setupInstructions.some((ix) => !isKnownSetup(ix))) {
    return "setup instructions are outside the known ATA, token, and wSOL-funding set";
  }
  if (envelope.swapInstruction.programId !== JUP6_PROGRAM) {
    return "swap instruction did not run on the Jupiter v6 aggregator program";
  }
  if (envelope.otherInstructions.length > 0) return "response carried unexpected otherInstructions";
  if (envelope.tipInstruction) return "response carried a tip instruction; auto tips are banned";
  return cleanupRejection(envelope.cleanupInstruction);
};

/** Only `setComputeUnitPrice`: a provider-chosen compute-unit limit is never assembled. */
/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const isPriceInstruction = (ix) =>
  ix.programId === COMPUTE_BUDGET_PROGRAM && dataBytes(ix.data)[0] === SET_COMPUTE_UNIT_PRICE;

/** Idempotent ATA create, any token-program instruction, or a plain System transfer. */
/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const isKnownSetup = (ix) => {
  const byte0 = dataBytes(ix.data)[0];
  return (
    (ix.programId === ATA_PROGRAM && byte0 === ATA_CREATE_IDEMPOTENT) ||
    TOKEN_PROGRAMS.has(ix.programId) ||
    (ix.programId === SYSTEM_PROGRAM && byte0 === SYSTEM_TRANSFER)
  );
};

/** Cleanup may only close a token account the taker owns. */
/** @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope["cleanupInstruction"]} cleanup */
const cleanupRejection = (cleanup) => {
  if (cleanup === null) return undefined;
  const isCloseAccount =
    dataBytes(cleanup.data)[0] === CLOSE_ACCOUNT && TOKEN_PROGRAMS.has(cleanup.programId);
  return isCloseAccount ? undefined : "cleanup instruction was not a token closeAccount";
};

/**
 * Only the taker may be required to sign, in any instruction, and the swap must require the
 * taker. The provider never gets a signature it did not ask the configured signer for.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {string} taker
 */
export const signerRejection = (envelope, taker) => {
  const all = [
    ...envelope.computeBudgetInstructions,
    ...envelope.setupInstructions,
    envelope.swapInstruction,
    ...(envelope.cleanupInstruction ? [envelope.cleanupInstruction] : []),
    ...envelope.otherInstructions,
    ...(envelope.tipInstruction ? [envelope.tipInstruction] : []),
  ];
  for (const ix of all) {
    const foreign = ix.accounts.find((a) => a.isSigner && a.pubkey !== taker);
    if (foreign) return "an account outside the configured signer was required to sign";
  }
  if (envelope.swapInstruction.accounts.every((a) => !(a.isSigner && a.pubkey === taker))) {
    return "swap instruction did not require the configured signer";
  }
  return undefined;
};
