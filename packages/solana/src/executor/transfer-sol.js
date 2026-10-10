// @ts-check
import { address, lamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import { TRANSFER_COMPUTE_UNIT_LIMIT, transferPriorityFeeLamports } from "./transfer-fee.js";

/**
 * @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit
 * @typedef {import("@solos-sh/actions").TransferSolAction} TransferSolAction
 */

export const TRANSFER_V1_CONFIG = Object.freeze({
  computeUnitLimit: TRANSFER_COMPUTE_UNIT_LIMIT,
  loadedAccountsDataSizeLimit: 8_388_608,
  priorityFeeLamports: transferPriorityFeeLamports(),
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
