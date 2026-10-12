// @ts-check
import { TRANSFER_BASE_FEE_LAMPORTS } from "@solos/core";
import { swapPriorityFeeLamports } from "./jupiter-swap-build-assemble.js";

/**
 * One signer's base fee plus the priority fee the swap builder sets on the message.
 * That priority fee is ceil(compute-unit price × compute-unit limit / 1_000_000).
 * @returns {bigint}
 */
export const swapFeeReserveLamports = () => TRANSFER_BASE_FEE_LAMPORTS + swapPriorityFeeLamports();
