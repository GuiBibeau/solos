// @ts-check
import { address, lamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { TRANSFER_PRIORITY_FEE_LAMPORTS } from "@solos/core";

/**
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos/actions").TransferSolAction} TransferSolAction
 */

export const TRANSFER_V1_CONFIG = Object.freeze({
  computeUnitLimit: 50_000,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: TRANSFER_PRIORITY_FEE_LAMPORTS,
});

/**
 * The draft of one SOL transfer from the signer. Submission fetches its lifetime and signs it.
 * @param {Kit} kit
 * @param {TransferSolAction} action
 * @returns {import("../submission/seal-draft.js").Draft}
 */
export const transferDraft = (kit, action) => ({
  label: "transfer",
  instructions: [
    getTransferSolInstruction({
      source: kit.signer,
      destination: address(action.to),
      amount: lamports(BigInt(action.lamports)),
    }),
  ],
  config: TRANSFER_V1_CONFIG,
});
