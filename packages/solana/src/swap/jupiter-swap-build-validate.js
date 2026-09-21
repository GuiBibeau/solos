// @ts-check
import { getBase64Codec } from "@solana/kit";

/**
 * Semantic validation of one Jupiter V2 build, before anything is signed. Program allowlist:
 * well-formed ComputeBudget `setComputeUnitPrice` only (stripped at assembly — v1 carries no
 * budget instructions), ATA/Token setup in its exact safe forms, System transfer only to fund
 * the taker's own wSOL account, the JUP6 aggregator swap, and a classic-Token `closeAccount`
 * cleanup. Token instructions that move, approve, re-authorize, mint, or burn are refused by
 * discriminator. Fixed reason strings only; amounts are BigInt, never a JS Number.
 */

export const COMPUTE_BUDGET_PROGRAM = "ComputeBudget111111111111111111111111111111";
export const ATA_PROGRAM = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
export const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
export const JUP6_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
export const SYSTEM_PROGRAM = "11111111111111111111111111111111";
export const WSOL_MINT = "So11111111111111111111111111111111111111112";

/** Instruction discriminators (first data byte) of the allowlisted instructions. */
const SET_COMPUTE_UNIT_PRICE = 3;
const ATA_CREATE = 0;
const ATA_CREATE_IDEMPOTENT = 1;
const CLOSE_ACCOUNT = 9;
export const SYSTEM_TRANSFER = 2;
const SYNC_NATIVE = 17;

/**
 * Base64 instruction data to bytes, the one decoding validation needs.
 * @param {string} base64 @returns {import("@solana/kit").ReadonlyUint8Array}
 */
export const dataBytes = (base64) => getBase64Codec().encode(base64);

/**
 * Only a well-formed `setComputeUnitPrice` may travel; assembly strips it (v1 has none).
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
const budgetRejection = (envelope) => {
  const malformed = envelope.computeBudgetInstructions.find((ix) => {
    const bytes = dataBytes(ix.data);
    return (
      ix.programId !== COMPUTE_BUDGET_PROGRAM ||
      bytes[0] !== SET_COMPUTE_UNIT_PRICE ||
      bytes.length !== 9
    );
  });
  return malformed
    ? "compute budget instructions may only carry a well-formed compute unit price"
    : undefined;
};

/**
 * Setup instruction forms: a canonical ATA create, a classic-Token SyncNative, or a plain
 * System transfer. Any other token discriminator — transfer, approve, set-authority, mint-to,
 * burn — or an unknown one is refused by form alone, before any account is read.
 */
const FORBIDDEN_TOKEN_REASON =
  "setup carried a forbidden token instruction: transfer, approve, set-authority, mint-to, or burn";
const UNKNOWN_SETUP_REASON =
  "setup instructions are outside the known ATA, token, and wSOL-funding set";

/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const ataFormRejection = (ix) => {
  const bytes = dataBytes(ix.data);
  const discriminator = bytes[0];
  return bytes.length === 1 &&
    (discriminator === ATA_CREATE || discriminator === ATA_CREATE_IDEMPOTENT)
    ? undefined
    : "setup carried an unknown ATA instruction";
};

/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const tokenSetupFormRejection = (ix) =>
  dataBytes(ix.data)[0] === SYNC_NATIVE ? undefined : FORBIDDEN_TOKEN_REASON;

/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const systemFormRejection = (ix) =>
  dataBytes(ix.data)[0] === SYSTEM_TRANSFER
    ? undefined
    : "setup carried an unknown System instruction";

/** @param {import("./jupiter-swap-build-response.js").RawInstruction} ix */
const setupInstructionRejection = (ix) => {
  if (ix.programId === ATA_PROGRAM) return ataFormRejection(ix);
  if (ix.programId === TOKEN_PROGRAM) return tokenSetupFormRejection(ix);
  if (ix.programId === TOKEN_2022_PROGRAM)
    return "setup carried a forbidden token-2022 instruction";
  if (ix.programId === SYSTEM_PROGRAM) return systemFormRejection(ix);
  return UNKNOWN_SETUP_REASON;
};

/** @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope */
const setupFormRejection = (envelope) => {
  for (const ix of envelope.setupInstructions) {
    const rejection = setupInstructionRejection(ix);
    if (rejection) return rejection;
  }
  return undefined;
};

/** Cleanup may only close a classic token account, in the three-account closeAccount form. */
/** @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope["cleanupInstruction"]} cleanup */
const cleanupFormRejection = (cleanup) => {
  if (cleanup === null) return undefined;
  const isCloseAccount =
    cleanup.programId === TOKEN_PROGRAM &&
    dataBytes(cleanup.data)[0] === CLOSE_ACCOUNT &&
    cleanup.accounts.length === 3;
  return isCloseAccount ? undefined : "cleanup instruction was not a token closeAccount";
};

/**
 * Every allowlisted program and instruction form, in a fixed rejection order.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 */
export const programRejection = (envelope) => {
  if (envelope.otherInstructions.length > 0) {
    return "response carried unexpected otherInstructions";
  }
  if (envelope.tipInstruction) return "response carried a tip instruction; auto tips are banned";
  if (envelope.swapInstruction.programId !== JUP6_PROGRAM) {
    return "swap instruction did not run on the Jupiter v6 aggregator program";
  }
  return (
    budgetRejection(envelope) ??
    setupFormRejection(envelope) ??
    cleanupFormRejection(envelope.cleanupInstruction)
  );
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
