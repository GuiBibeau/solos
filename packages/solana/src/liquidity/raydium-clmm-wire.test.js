// @ts-check
/**
 * The wire form of both Raydium liquidity instructions, pinned against the IDL at the commit in
 * `raydium-clmm-program.js`.
 *
 * The account orders differ between increase and decrease in one specific way — `pool_state` and
 * `personal_position` are swapped — and nothing about the code makes that visible. Both are
 * asserted independently here, and so is the difference itself, because a copy-paste between the
 * two builders is the most likely way this breaks.
 */
import { describe, expect, test } from "bun:test";
import { getU64Decoder } from "@solana/kit";
import {
  DECREASE_LIQUIDITY_V2_DISCRIMINATOR,
  INCREASE_LIQUIDITY_V2_DISCRIMINATOR,
  MEMO_PROGRAM,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
  decreaseLiquidityV2Accounts,
  decreaseLiquidityV2Data,
  increaseLiquidityV2Accounts,
  increaseLiquidityV2Data,
} from "./raydium-clmm-instruction.js";

const A = {
  nftOwner: "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt",
  nftAccount: "66o3kiYMgs7ws8wqMKNdP9yiAZcxr4y5DfjsUiyd9EcS",
  poolState: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
  protocolPosition: "11i3XCZKADDnubhDskNAv9RSxZa9tQqH5zFVkG8cLvm",
  personalPosition: "D3eZCYdUE2uCRkQGx3k1dMTq9UEihhW2CSmdKR7ZQ4dp",
  tickArrayLower: "9fznAX9wi4uhKBytKVdQo4fed6ue3UyYYW7qkZZh1kjV",
  tickArrayUpper: "64HXXxqqxtd8MocvVjBejDGS9hVMTEaVEpYu7MnRiMqk",
  tokenAccount0: "4uisq4ndD2eLNqaKm27UzQJBKQ4LHs9D92mZg9z5kttd",
  tokenAccount1: "BHMsVEWTLBdtLNQ98y978RA9km7N8JtnHn1AJWMmHnAz",
  tokenVault0: "4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A",
  tokenVault1: "5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo",
  vault0Mint: "So11111111111111111111111111111111111111112",
  vault1Mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

/** Kit roles: 0 read-only, 1 writable, 2 signer, 3 writable signer. */
const at = (/** @type {{address: string; role: number}[]} */ list, /** @type {number} */ i) => ({
  address: String(list[i]?.address),
  role: list[i]?.role,
});

describe("raydium increase_liquidity_v2 wire form", () => {
  test("data is the pinned discriminator, a u128 and two u64s, then a None option byte", () => {
    const data = increaseLiquidityV2Data({
      liquidity: 24_012_912_330n,
      amount0Max: 1_000_000n,
      amount1Max: 2_000_000n,
    });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(INCREASE_LIQUIDITY_V2_DISCRIMINATOR));
    // 8 discriminator + 16 liquidity + 8 + 8 + 1 option tag.
    expect(data).toHaveLength(41);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getBigUint64(8, true)).toBe(24_012_912_330n);
    expect(view.getBigUint64(16, true)).toBe(0n);
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(24, 32))).toBe(1_000_000n);
    expect(u64.decode(data.slice(32, 40))).toBe(2_000_000n);
    // base_flag is always None: we size the position ourselves rather than letting the program.
    expect(data[40]).toBe(0);
  });

  test("a u128 liquidity survives past the 64-bit boundary", () => {
    const big = (1n << 100n) + 7n;
    const data = increaseLiquidityV2Data({ liquidity: big, amount0Max: 0n, amount1Max: 0n });
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const low = view.getBigUint64(8, true);
    const high = view.getBigUint64(16, true);
    expect(low | (high << 64n)).toBe(big);
  });

  test("15 accounts in the IDL order, with one signer and the fixed programs", () => {
    const accounts = increaseLiquidityV2Accounts(A);
    expect(accounts).toHaveLength(15);
    expect(at(accounts, 0)).toEqual({ address: A.nftOwner, role: 2 });
    expect(at(accounts, 1)).toEqual({ address: A.nftAccount, role: 0 });
    expect(at(accounts, 2)).toEqual({ address: A.poolState, role: 1 });
    expect(at(accounts, 3)).toEqual({ address: A.protocolPosition, role: 0 });
    expect(at(accounts, 4)).toEqual({ address: A.personalPosition, role: 1 });
    expect(at(accounts, 11)).toEqual({ address: TOKEN_PROGRAM, role: 0 });
    expect(at(accounts, 12)).toEqual({ address: TOKEN_2022_PROGRAM, role: 0 });
    expect(accounts.filter((account) => account.role >= 2)).toHaveLength(1);
  });

  // Deprecated upstream and no longer read, but a wrong derivation here would fail silently now
  // and loudly whenever that changes. Read-only is the safe shape either way.
  test("the protocol position rides along read-only", () => {
    expect(at(increaseLiquidityV2Accounts(A), 3).role).toBe(0);
  });

  test("the bitmap extension appends as a writable remaining account, or not at all", () => {
    expect(increaseLiquidityV2Accounts(A)).toHaveLength(15);
    const withExtension = increaseLiquidityV2Accounts({ ...A, bitmapExtension: A.poolState });
    expect(withExtension).toHaveLength(16);
    expect(at(withExtension, 15)).toEqual({ address: A.poolState, role: 1 });
  });
});

describe("raydium decrease_liquidity_v2 wire form", () => {
  test("data carries no option byte, unlike increase", () => {
    const data = decreaseLiquidityV2Data({
      liquidity: 100n,
      amount0Min: 5n,
      amount1Min: 6n,
    });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(DECREASE_LIQUIDITY_V2_DISCRIMINATOR));
    expect(data).toHaveLength(40);
  });

  test("16 accounts in the IDL order, including the mandatory memo program", () => {
    const accounts = decreaseLiquidityV2Accounts(A);
    expect(accounts).toHaveLength(16);
    expect(at(accounts, 13)).toEqual({ address: MEMO_PROGRAM, role: 0 });
    expect(accounts.filter((account) => account.role >= 2)).toHaveLength(1);
  });

  // The whole reason both orders are pinned separately.
  test("pool_state and personal_position are swapped relative to increase", () => {
    const increase = increaseLiquidityV2Accounts(A);
    const decrease = decreaseLiquidityV2Accounts(A);
    expect(at(increase, 2).address).toBe(A.poolState);
    expect(at(increase, 4).address).toBe(A.personalPosition);
    expect(at(decrease, 2).address).toBe(A.personalPosition);
    expect(at(decrease, 3).address).toBe(A.poolState);
  });

  test("reward groups append in threes after the extension, vault and recipient writable", () => {
    const reward = { vault: A.tokenVault0, recipient: A.tokenAccount0, mint: A.vault0Mint };
    const accounts = decreaseLiquidityV2Accounts(A, [reward]);
    expect(accounts).toHaveLength(19);
    expect(at(accounts, 16)).toEqual({ address: reward.vault, role: 1 });
    expect(at(accounts, 17)).toEqual({ address: reward.recipient, role: 1 });
    expect(at(accounts, 18)).toEqual({ address: reward.mint, role: 0 });
  });

  test("the extension precedes the reward groups when both are present", () => {
    const reward = { vault: A.tokenVault0, recipient: A.tokenAccount0, mint: A.vault0Mint };
    const accounts = decreaseLiquidityV2Accounts({ ...A, bitmapExtension: A.poolState }, [reward]);
    expect(accounts).toHaveLength(20);
    expect(at(accounts, 16)).toEqual({ address: A.poolState, role: 1 });
    expect(at(accounts, 17).address).toBe(reward.vault);
  });
});
