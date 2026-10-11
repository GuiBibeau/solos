// @ts-check
import { usdForLamports } from "@solos/core/strategy";
import { transferFeeReserveLamports } from "@solos/solana/executor/transfer-fee";

/**
 * Exact USD value of a lamport amount at a USD-per-SOL price. The swap hold and the swap
 * settle call the same function, so the fee term cannot drift.
 * @param {string} lamports
 * @param {string} priceUsd
 * @returns {string | undefined}
 */
export const lamportsToUsd = usdForLamports;

/**
 * Principal plus the fee reserve the transfer builder sets (base signature fee plus the
 * priority fee from its compute-unit price times its compute-unit limit).
 * A zero-lamport transfer still holds the fee.
 * @param {string} lamports
 * @param {string} priceUsd
 * @returns {string | undefined}
 */
export const transferNotionalUsd = (lamports, priceUsd) => {
  if (!/^\d+$/.test(lamports)) return undefined;
  const held = (BigInt(lamports) + transferFeeReserveLamports()).toString();
  return lamportsToUsd(held, priceUsd);
};
