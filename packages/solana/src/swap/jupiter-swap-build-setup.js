// @ts-check
import { address, getU32Codec, getU64Codec } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  ATA_PROGRAM,
  SYSTEM_PROGRAM,
  SYSTEM_TRANSFER,
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
const MISSING_SYNC_REASON = "setup wSOL funding transfer had no SyncNative behind it";

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
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
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
 * One System transfer against the exact-amount temporary-wSOL binding, in the canonical
 * 12-byte wire form: little-endian u32 discriminator, then the u64 lamport amount.
 * @param {{ transfer: import("./jupiter-swap-build-response.js").RawInstruction;
 *   action: import("@solos/actions").SwapAction; taker: string; tempWsol: string }} bound
 */
const transferRejection = async ({ transfer, action, taker, tempWsol }) => {
  if (transfer.accounts[0]?.pubkey !== taker) return "setup transfer source was not the taker";
  if (transfer.accounts[1]?.pubkey !== tempWsol) {
    return "setup transfer did not fund the taker's own wSOL account";
  }
  const bytes = dataBytes(transfer.data);
  if (bytes.length !== 12 || getU32Codec().decode(bytes, 0) !== SYSTEM_TRANSFER) {
    return "setup transfer was not the canonical 12-byte System transfer";
  }
  if (getU64Codec().decode(bytes, 4) !== BigInt(action.amount)) {
    return "setup transfer did not carry the exact requested input amount";
  }
  return undefined;
};

/**
 * The documented wSOL wrap is an exact pair, in safe order before the route: one canonical
 * System transfer of the requested amount into the taker's temporary account, then exactly one
 * SyncNative on that account. A missing half, duplicates, a stray SyncNative, or any wrap
 * instruction for a non-wSOL input is refused with a fixed reason.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
 */
const wrapRejection = async (envelope, action, taker) => {
  const order = envelope.setupInstructions;
  const transfers = order.filter((ix) => ix.programId === SYSTEM_PROGRAM);
  const syncs = order.filter((ix) => dataBytes(ix.data)[0] === SYNC_NATIVE);
  if (transfers.length === 0 && syncs.length === 0) return undefined;
  if (envelope.inputMint !== WSOL_MINT) return WRAP_INPUT_REASON;
  if (transfers.length === 0) return SYNC_OUTSIDE_WRAP_REASON;
  if (transfers.length > 1) return "setup carried more than one wSOL funding transfer";
  const [transfer] = transfers;
  if (!transfer) return SYNC_OUTSIDE_WRAP_REASON;
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  const rejection = await transferRejection({ transfer, action, taker, tempWsol });
  return rejection ?? (await syncPairRejection({ order, transfer, syncs, tempWsol }));
};

/**
 * The SyncNative half of the wrap pair: exactly one, on the taker's temporary account, after
 * its funding transfer.
 * @param {{
 *   order: import("./jupiter-swap-build-response.js").RawInstruction[];
 *   transfer: import("./jupiter-swap-build-response.js").RawInstruction;
 *   syncs: import("./jupiter-swap-build-response.js").RawInstruction[];
 *   tempWsol: import("@solana/kit").Address;
 * }} bound
 */
const syncPairRejection = async ({ order, transfer, syncs, tempWsol }) => {
  if (syncs.length === 0) return MISSING_SYNC_REASON;
  if (syncs.length > 1) return "setup carried more than one SyncNative";
  const [sync] = syncs;
  if (!sync || sync.accounts[0]?.pubkey !== tempWsol) {
    return "setup SyncNative did not target the taker's temporary wSOL account";
  }
  if (order.indexOf(transfer) > order.indexOf(sync)) {
    return "setup SyncNative did not follow the wSOL funding transfer";
  }
  return undefined;
};

/**
 * The cleanup closeAccount is limited to the legitimate temporary-wSOL form: [account,
 * destination, authority], destination and authority both the taker.
 * @param {NonNullable<import("./jupiter-swap-build-response.js").JupiterBuildEnvelope["cleanupInstruction"]>} cleanup
 * @param {string} taker
 */
const cleanupBindingRejection = async (cleanup, taker) => {
  const tempWsol = await derivedAta(taker, WSOL_MINT);
  if (cleanup.accounts[0]?.pubkey !== tempWsol) {
    return "cleanup did not close the taker's temporary wSOL account";
  }
  if (cleanup.accounts[1]?.pubkey !== taker) {
    return "cleanup rent destination was not the taker";
  }
  if (cleanup.accounts[2]?.pubkey !== taker) return "cleanup authority was not the taker";
  return undefined;
};

/**
 * The full ownership-binding rejection for setup and cleanup. Undefined means acceptable.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos/actions").SwapAction} action @param {string} taker
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
