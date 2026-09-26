// @ts-check
/**
 * The wire form of remove-only `rebalance_liquidity`, pinned against the IDL at the
 * commit in `meteora-dlmm-program.js`. Account order is the IDL order, then writable
 * bin arrays. Claim flags stay off.
 */
import { describe, expect, test } from "bun:test";
import { getU64Decoder } from "@solana/kit";
import { METEORA_DLMM_PROGRAM } from "./meteora-dlmm-program.js";
import {
  MEMO_PROGRAM,
  REBALANCE_LIQUIDITY_DISCRIMINATOR,
  SHRINK_NO_SHRINK_BOTH,
  SYSTEM_PROGRAM,
  rebalanceLiquidityAccounts,
  rebalanceLiquidityData,
} from "./meteora-dlmm-rebalance.js";

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
  owner: "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt",
  rentPayer: "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt",
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

/** @param {Uint8Array} data */
const viewOf = (data) => new DataView(data.buffer, data.byteOffset, data.byteLength);

describe("meteora rebalance_liquidity wire form", () => {
  test("a full exit is remove-only, claims nothing, and keeps both range edges", () => {
    const data = rebalanceLiquidityData({
      activeId: -20,
      maxActiveBinSlippage: 50,
      minWithdrawX: 995n,
      minWithdrawY: 796n,
      removes: [
        { binId: -3, bps: 10_000 },
        { binId: 4, bps: 10_000 },
      ],
    });
    const view = viewOf(data);
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(REBALANCE_LIQUIDITY_DISCRIMINATOR));
    expect(view.getInt32(8, true)).toBe(-20);
    expect(view.getUint16(12, true)).toBe(50);
    expect(view.getUint8(14)).toBe(0);
    expect(view.getUint8(15)).toBe(0);
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(16, 24))).toBe(995n);
    expect(u64.decode(data.slice(24, 32))).toBe(0n);
    expect(u64.decode(data.slice(32, 40))).toBe(796n);
    expect(u64.decode(data.slice(40, 48))).toBe(0n);
    expect(view.getUint8(48)).toBe(SHRINK_NO_SHRINK_BOTH);
    expect(view.getUint32(80, true)).toBe(2);
    expect(view.getUint8(84)).toBe(1);
    expect(view.getInt32(85, true)).toBe(-3);
    expect(view.getUint16(94, true)).toBe(10_000);
    expect(view.getInt32(113, true)).toBe(4);
    expect(view.getUint16(122, true)).toBe(10_000);
    const afterRemoves = 84 + 28 * 2;
    expect(view.getUint32(afterRemoves, true)).toBe(0);
    expect(view.getUint32(afterRemoves + 4, true)).toBe(0);
    expect(data).toHaveLength(afterRemoves + 8);
  });

  test("a partial remove encodes the requested bps and still adds nothing", () => {
    const data = rebalanceLiquidityData({
      activeId: 0,
      maxActiveBinSlippage: 0,
      minWithdrawX: 497n,
      minWithdrawY: 0n,
      removes: [{ binId: 0, bps: 5000 }],
    });
    const view = viewOf(data);
    expect(view.getUint16(94, true)).toBe(5000);
    expect(view.getUint32(80, true)).toBe(1);
    expect(view.getUint32(112, true)).toBe(0);
  });

  test("17 named accounts in IDL order, then one writable bin array", () => {
    const accounts = rebalanceLiquidityAccounts(A);
    expect(accounts).toHaveLength(18);
    expect(at(accounts, 0)).toEqual({ address: A.position, role: 1 });
    expect(at(accounts, 1)).toEqual({ address: A.lbPair, role: 1 });
    expect(at(accounts, 2)).toEqual({ address: METEORA_DLMM_PROGRAM, role: 0 });
    const extended = rebalanceLiquidityAccounts({ ...A, bitmapExtension: A.lbPair });
    expect(at(extended, 2)).toEqual({ address: A.lbPair, role: 1 });
    expect(at(accounts, 3)).toEqual({ address: A.userTokenX, role: 1 });
    expect(at(accounts, 4)).toEqual({ address: A.userTokenY, role: 1 });
    expect(at(accounts, 5)).toEqual({ address: A.reserveX, role: 1 });
    expect(at(accounts, 6)).toEqual({ address: A.reserveY, role: 1 });
    expect(at(accounts, 7)).toEqual({ address: A.tokenXMint, role: 0 });
    expect(at(accounts, 8)).toEqual({ address: A.tokenYMint, role: 0 });
    expect(at(accounts, 9)).toEqual({ address: A.owner, role: 2 });
    expect(at(accounts, 10)).toEqual({ address: A.rentPayer, role: 3 });
    expect(at(accounts, 11)).toEqual({ address: TOKEN_PROGRAM, role: 0 });
    expect(at(accounts, 12)).toEqual({ address: TOKEN_2022_PROGRAM, role: 0 });
    expect(at(accounts, 13)).toEqual({ address: MEMO_PROGRAM, role: 0 });
    expect(at(accounts, 14)).toEqual({ address: SYSTEM_PROGRAM, role: 0 });
    expect(at(accounts, 15)).toEqual({ address: A.eventAuthority, role: 0 });
    expect(at(accounts, 16)).toEqual({ address: METEORA_DLMM_PROGRAM, role: 0 });
    expect(at(accounts, 17)).toEqual({ address: A.binArrays[0], role: 1 });
  });
});
