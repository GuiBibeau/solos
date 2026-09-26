// @ts-check
/**
 * The wire form of `add_liquidity2`, pinned against the IDL at the commit in
 * `meteora-dlmm-program.js`. Account order is the IDL order, then writable bin arrays.
 */
import { describe, expect, test } from "bun:test";
import { getU64Decoder } from "@solana/kit";
import {
  ADD_LIQUIDITY2_DISCRIMINATOR,
  addLiquidity2Accounts,
  addLiquidity2Data,
} from "./meteora-dlmm-instruction.js";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const A = {
  position: "D3eZCYdUE2uCRkQGx3k1dMTq9UEihhW2CSmdKR7ZQ4dp",
  lbPair: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
  bitmapExtension: METEORA_DLMM_PROGRAM,
  userTokenX: "4uisq4ndD2eLNqaKm27UzQJBKQ4LHs9D92mZg9z5kttd",
  userTokenY: "BHMsVEWTLBdtLNQ98y978RA9km7N8JtnHn1AJWMmHnAz",
  reserveX: "4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A",
  reserveY: "5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo",
  tokenXMint: "So11111111111111111111111111111111111111112",
  tokenYMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  sender: "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt",
  tokenXProgram: TOKEN_PROGRAM,
  tokenYProgram: TOKEN_2022_PROGRAM,
  eventAuthority: "66o3kiYMgs7ws8wqMKNdP9yiAZcxr4y5DfjsUiyd9EcS",
  binArrays: ["9fznAX9wi4uhKBytKVdQo4fed6ue3UyYYW7qkZZh1kjV"],
};

/** Kit roles: 0 read-only, 1 writable, 2 signer, 3 writable signer. */
const at = (/** @type {{address: string; role: number}[]} */ list, /** @type {number} */ i) => ({
  address: String(list[i]?.address),
  role: list[i]?.role,
});

describe("meteora add_liquidity2 wire form", () => {
  test("data is the pinned discriminator, LiquidityParameter, and an empty remaining-accounts list", () => {
    const data = addLiquidity2Data({
      amountX: 1_000_000n,
      amountY: 2_000_000n,
      bins: [{ binId: -1, distributionX: 0, distributionY: 10_000 }],
    });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(ADD_LIQUIDITY2_DISCRIMINATOR));
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(8, 16))).toBe(1_000_000n);
    expect(u64.decode(data.slice(16, 24))).toBe(2_000_000n);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getUint32(24, true)).toBe(1);
    expect(view.getInt32(28, true)).toBe(-1);
    expect(view.getUint16(32, true)).toBe(0);
    expect(view.getUint16(34, true)).toBe(10_000);
    expect(view.getUint32(36, true)).toBe(0);
    expect(data).toHaveLength(40);
  });

  test("14 named accounts in IDL order, then one writable bin array, and a single signer", () => {
    const accounts = addLiquidity2Accounts(A);
    expect(accounts).toHaveLength(15);
    expect(at(accounts, 0)).toEqual({ address: A.position, role: 1 });
    expect(at(accounts, 1)).toEqual({ address: A.lbPair, role: 1 });
    expect(at(accounts, 2)).toEqual({ address: METEORA_DLMM_PROGRAM, role: 0 });
    const extended = addLiquidity2Accounts({ ...A, bitmapExtension: A.lbPair });
    expect(at(extended, 2)).toEqual({ address: A.lbPair, role: 1 });
    expect(at(accounts, 3)).toEqual({ address: A.userTokenX, role: 1 });
    expect(at(accounts, 4)).toEqual({ address: A.userTokenY, role: 1 });
    expect(at(accounts, 5)).toEqual({ address: A.reserveX, role: 1 });
    expect(at(accounts, 6)).toEqual({ address: A.reserveY, role: 1 });
    expect(at(accounts, 7)).toEqual({ address: A.tokenXMint, role: 0 });
    expect(at(accounts, 8)).toEqual({ address: A.tokenYMint, role: 0 });
    expect(at(accounts, 9)).toEqual({ address: A.sender, role: 2 });
    expect(at(accounts, 10)).toEqual({ address: TOKEN_PROGRAM, role: 0 });
    expect(at(accounts, 11)).toEqual({ address: TOKEN_2022_PROGRAM, role: 0 });
    expect(at(accounts, 12)).toEqual({ address: A.eventAuthority, role: 0 });
    expect(at(accounts, 13)).toEqual({ address: METEORA_DLMM_PROGRAM, role: 0 });
    expect(at(accounts, 14)).toEqual({ address: A.binArrays[0], role: 1 });
    expect(accounts.filter((account) => account.role >= 2)).toHaveLength(1);
  });
});
