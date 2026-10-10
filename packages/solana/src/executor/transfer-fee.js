// @ts-check
import { TRANSFER_BASE_FEE_LAMPORTS } from "@solos/core";

const MICRO_LAMPORTS_PER_LAMPORT = 1_000_000n;

/** Micro-lamports per compute unit. The transfer builder pays this price times the limit. */
export const TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS = 20_000n;

/** Compute-unit limit the transfer builder sets on the v1 message. */
export const TRANSFER_COMPUTE_UNIT_LIMIT = 50_000;

/**
 * Priority fee in lamports: ceil(price × limit / 1_000_000). The v1 config pays this total.
 * @returns {bigint}
 */
export const transferPriorityFeeLamports = () => {
  const micro = TRANSFER_COMPUTE_UNIT_PRICE_MICRO_LAMPORTS * BigInt(TRANSFER_COMPUTE_UNIT_LIMIT);
  return (micro + MICRO_LAMPORTS_PER_LAMPORT - 1n) / MICRO_LAMPORTS_PER_LAMPORT;
};

/**
 * One signer's base fee plus the priority fee the transfer builder sets on the message.
 * @returns {bigint}
 */
export const transferFeeReserveLamports = () =>
  TRANSFER_BASE_FEE_LAMPORTS + transferPriorityFeeLamports();
