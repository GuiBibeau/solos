// @ts-check
/** Pure selection bounds and outcome, shared by the enumeration flow and its unit tests. */
import { BATCH_CHUNK, chunksOf } from "./liquidity-accounts.js";

/** Enumeration bounds (ADR-0018): a hard account bound and a hard candidate bound. */
export const MAX_TOKEN_ACCOUNTS = 4096;
export const MAX_POSITION_CANDIDATES = 256;

/** Pure selection outcome. @typedef {{ readonly status: "selected"; readonly mints: string[]; readonly chunks: string[][] } | { readonly status: "incomplete"; readonly reason: string }} CandidateSelection */

/**
 * Pure candidate selection: which of the owner's token accounts name a possible position
 * receipt. Exactly the official algorithm's filter — amount 1 (an NFT), deduplicated by
 * mint — plus the ADR-0018 bounds. Reaching a bound is incomplete; a partial array is never
 * selected.
 * @param {ReadonlyArray<{ readonly mint: string; readonly amount: bigint }>} accounts
 * @returns {CandidateSelection}
 */
export const selectPositionCandidates = (accounts) => {
  if (accounts.length > MAX_TOKEN_ACCOUNTS) {
    return { status: "incomplete", reason: "owner holds more than 4096 token accounts" };
  }
  const mints = [...new Set(accounts.filter((a) => a.amount === 1n).map((a) => a.mint))];
  if (mints.length > MAX_POSITION_CANDIDATES) {
    return { status: "incomplete", reason: "owner holds more than 256 candidate position mints" };
  }
  return { status: "selected", mints, chunks: chunksOf(mints, BATCH_CHUNK) };
};
