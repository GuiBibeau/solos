// @ts-check
import { getU32Codec, getU64Codec } from "@solana/kit";
import { derivedAta } from "./jupiter-swap-build-setup-account.js";
import {
  SYSTEM_PROGRAM,
  SYSTEM_TRANSFER,
  WSOL_MINT,
  dataBytes,
} from "./jupiter-swap-build-validate.js";

const SYNC_NATIVE = 17;
const WRAP_INPUT_REASON = "setup moved native SOL without a wSOL input";
const SYNC_OUTSIDE_WRAP_REASON = "setup carried a SyncNative outside the documented wSOL wrap";
const MISSING_SYNC_REASON = "setup wSOL funding transfer had no SyncNative behind it";

/** @typedef {import("./jupiter-swap-build-response.js").RawInstruction} RawInstruction */

/** @param {{ transfer: RawInstruction; action: import("@solos-sh/actions").SwapAction;
 * taker: string; tempWsol: string }} bound */
const transferRejection = ({ transfer, action, taker, tempWsol }) => {
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

/** @param {{ order: RawInstruction[]; transfer: RawInstruction;
 * syncs: RawInstruction[]; tempWsol: import("@solana/kit").Address }} bound */
const syncPairRejection = ({ order, transfer, syncs, tempWsol }) => {
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
 * Require an exact System-transfer/SyncNative pair for a wSOL input.
 * @param {import("./jupiter-swap-build-response.js").JupiterBuildEnvelope} envelope
 * @param {import("@solos-sh/actions").SwapAction} action @param {string} taker
 */
export const wrapRejection = async (envelope, action, taker) => {
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
  const rejection = transferRejection({ transfer, action, taker, tempWsol });
  return rejection ?? syncPairRejection({ order, transfer, syncs, tempWsol });
};
