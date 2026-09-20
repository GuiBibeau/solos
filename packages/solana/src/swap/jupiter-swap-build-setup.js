// @ts-check
import { address, getU64Codec } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  TOKEN_PROGRAM,
  WSOL_MINT,
  dataBytes,
} from "./jupiter-swap-build-validate.js";

/**
 * Ownership bindings for the allowlisted setup forms and the cleanup close: the ATA create is
 * bound to the taker and the requested swap mints, the wSOL wrap pairs an exact-amount System
 * transfer with a SyncNative on the taker's derived temporary account, and cleanup may only
 * close that account back to the taker. Fixed reasons; nothing here signs, sends, or dials.
 */

const SYNC_NATIVE = 17;
const WRAP_INPUT_REASON = "setup moved native SOL without a wSOL input";
const SYNC_OUTSIDE_WRAP_REASON = "setup carried a SyncNative outside the documented wSOL wrap";

/**
 * ATA derivation under a given token program.
 * @param {string} owner @param {string} mint @param {string} [tokenProgram]
 * @returns {Promise<import("@solana/kit").Address>}
 */
export const derivedAta = async (owner, mint, tokenProgram = TOKEN_PROGRAM) => {
  const [ata] = await findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(tokenProgram),
  });
  return ata;
};

/**
 * An idempotent ATA create must be paid and owned by the taker, target one of the requested
 * swap mints, and derive under the token program the instruction itself names.
 * @param {import("./jupiter-swap-build-response.js").RawInstruction} ix
 * @param {import("@solos/actions").SwapAction} action
 * @param {string} taker
 * @returns {Promise<string | undefined>}
 */
const ataCreateRejection = async (ix, action, taker) => {
  const [payer, account, owner, mint, , tokenProgram] = ix.accounts.map((a) => a.pubkey);
  if (payer !== taker) return "setup ATA create payer was not the taker";
  if (owner !== taker) return "setup ATA create owner was not the taker";
  if (mint !== action.inputMint && mint !== action.outputMint) {
    return "setup ATA create mint was not one of the requested swap mints";
  }
  const expected = await derivedAta(taker, mint, tokenProgram);
  return account === expected
    ? undefined
    : "setup ATA create did not target the taker's derived associated token account";
};

/**
 * One System transfer against the exact-amount temporary-wSOL binding.
 * @param {{ transfer: import("./jupiter-swap-build-response.js").RawInstruction;
 *   action: import("@solos/actions").SwapAction; taker: string; tempWsol: string }} bound
 * @returns {Promise<string | undefined>}
 */
const transferRejection = async ({ transfer, action, taker, tempWsol }) => {
  if (transfer.accounts[0]?.pubkey !== taker) return "setup transfer source was not the taker";
  if (transfer.accounts[1]?.pubkey !== tempWsol) {
    return "setup transfer did not fund the taker's own wSOL account";
  }
  if (getU64Codec().decode(dataBytes(transfer.data), 1) !== BigInt(action.amount)) {
    return "setup transfer did not carry the exact requested input amount";
  }
  return undefined;
};

/**
 * Every System transfer must fund the taker's temporary wSOL account with exactly the
 * requested input amount, and may exist only for native-SOL input.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
 * @returns {Promise<string | undefined>}
 */
const transfersRejection = async (envelope, action, taker) => {
  const transfers = envelope.setupInstructions.filter((ix) => ix.programId === SYSTEM_PROGRAM);
  if (transfers.length === 0) return undefined;
  if (envelope.inputMint !== WSOL_MINT) return WRAP_INPUT_REASON;
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  for (const transfer of transfers) {
    const rejection = await transferRejection({ transfer, action, taker, tempWsol });
    if (rejection) return rejection;
  }
  return undefined;
};

/**
 * The documented wSOL wrap binding: exact-amount transfer plus a SyncNative behind it.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
 * @returns {Promise<string | undefined>}
 */
const wrapRejection = async (envelope, action, taker) => {
  const transferRejection = await transfersRejection(envelope, action, taker);
  if (transferRejection) return transferRejection;
  const wrapped =
    envelope.inputMint === WSOL_MINT &&
    envelope.setupInstructions.some((ix) => ix.programId === SYSTEM_PROGRAM);
  const syncs = envelope.setupInstructions.filter((ix) => dataBytes(ix.data)[0] === SYNC_NATIVE);
  if (syncs.length === 0) return undefined;
  if (!wrapped) return SYNC_OUTSIDE_WRAP_REASON;
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  const stray = syncs.find((sync) => sync.accounts[0]?.pubkey !== tempWsol);
  return stray ? "setup SyncNative did not target the taker's temporary wSOL account" : undefined;
};

/**
 * The cleanup closeAccount is limited to the legitimate temporary-wSOL form: it closes the
 * taker's derived temporary wSOL account, with the taker as authority and rent destination.
 * @param {NonNullable<import("./jupiter-swap-build-response.js").JupiterBuildEnvelope["cleanupInstruction"]>} cleanup
 * @param {string} taker
 */
const cleanupBindingRejection = async (cleanup, taker) => {
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  if (cleanup.accounts[0]?.pubkey !== tempWsol) {
    return "cleanup did not close the taker's temporary wSOL account";
  }
  if (cleanup.accounts[1]?.pubkey !== taker) return "cleanup authority was not the taker";
  if (cleanup.accounts[2]?.pubkey !== taker) return "cleanup rent destination was not the taker";
  return undefined;
};

/**
 * The full ownership-binding rejection for setup and cleanup. Undefined means acceptable.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action
 * @param {string} taker
 * @returns {Promise<string | undefined>}
 */
export const setupBindingRejection = async (envelope, action, taker) => {
  for (const ix of envelope.setupInstructions) {
    if (ix.programId !== ATA_PROGRAM) continue;
    const rejection = await ataCreateRejection(ix, action, taker);
    if (rejection) return rejection;
  }
  return (
    (await wrapRejection(envelope, action, taker)) ??
    (envelope.cleanupInstruction
      ? await cleanupBindingRejection(envelope.cleanupInstruction, taker)
      : undefined)
  );
};
