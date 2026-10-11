// @ts-check
import { TRANSFER_BASE_FEE_LAMPORTS } from "@solos/core";
import { SWAP_MAX_PRIORITY_FEE_LAMPORTS } from "./jupiter-swap-build-assemble.js";

/**
 * One signer's base fee plus the flat priority fee the swap builder sets on the v1 message.
 * That priority fee is the local cap, paid as-is, not a compute-unit price times a limit.
 * @returns {bigint}
 */
export const swapFeeReserveLamports = () =>
  TRANSFER_BASE_FEE_LAMPORTS + SWAP_MAX_PRIORITY_FEE_LAMPORTS;
