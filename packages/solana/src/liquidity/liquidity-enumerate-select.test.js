// @ts-check
import { describe, expect, test } from "bun:test";
import { BATCH_CHUNK } from "./liquidity-accounts.js";
import {
  MAX_POSITION_CANDIDATES,
  MAX_TOKEN_ACCOUNTS,
  selectPositionCandidates,
} from "./liquidity-enumerate-select.js";

/** @param {number} count @returns {{ mint: string; amount: bigint }[]} distinct single-unit NFT rows */
const nftRows = (count) =>
  Array.from({ length: count }, (_, i) => ({ mint: `mint-${i}`, amount: 1n }));

describe("pure enumeration candidate selection", () => {
  test("keeps exactly the amount-1 rows and dedupes their mints", () => {
    const selection = selectPositionCandidates([
      { mint: "a", amount: 1n },
      { mint: "b", amount: 2n },
      { mint: "a", amount: 1n },
      { mint: "c", amount: 0n },
    ]);
    expect(selection).toEqual({
      status: "selected",
      mints: ["a"],
      chunks: [["a"]],
    });
  });

  test("an owner with no token accounts selects an empty, complete enumeration", () => {
    expect(selectPositionCandidates([])).toEqual({ status: "selected", mints: [], chunks: [] });
  });

  test("the account bound is 4096: at the bound selected, past it typed incomplete", () => {
    const fungible = Array.from(
      { length: MAX_TOKEN_ACCOUNTS - MAX_POSITION_CANDIDATES },
      (_, i) => ({ mint: `fungible-${i}`, amount: 2n }),
    );
    const atBound = [...nftRows(MAX_POSITION_CANDIDATES), ...fungible];
    expect(selectPositionCandidates(atBound).status).toBe("selected");
    const pastBound = [...atBound, { mint: "one-too-many", amount: 1n }];
    expect(selectPositionCandidates(pastBound)).toEqual({
      status: "incomplete",
      reason: "owner holds more than 4096 token accounts",
    });
  });

  test("the candidate bound is 256: at the bound selected in 100-sized chunks", () => {
    const selection = selectPositionCandidates(nftRows(MAX_POSITION_CANDIDATES));
    expect(selection.status).toBe("selected");
    if (selection.status !== "selected") throw new Error("unreachable");
    expect(selection.mints).toHaveLength(MAX_POSITION_CANDIDATES);
    expect(selection.chunks).toEqual([
      selection.mints.slice(0, BATCH_CHUNK),
      selection.mints.slice(BATCH_CHUNK, 2 * BATCH_CHUNK),
      selection.mints.slice(2 * BATCH_CHUNK),
    ]);
  });

  test("one candidate mint past 256 fails the whole enumeration, never a partial array", () => {
    const selection = selectPositionCandidates(nftRows(MAX_POSITION_CANDIDATES + 1));
    expect(selection).toEqual({
      status: "incomplete",
      reason: "owner holds more than 256 candidate position mints",
    });
  });

  test("non-NFT balances never become candidates even at volume", () => {
    const rows = Array.from({ length: MAX_TOKEN_ACCOUNTS }, (_, i) => ({
      mint: `fungible-${i}`,
      amount: 5n,
    }));
    expect(selectPositionCandidates(rows)).toEqual({ status: "selected", mints: [], chunks: [] });
  });
});
