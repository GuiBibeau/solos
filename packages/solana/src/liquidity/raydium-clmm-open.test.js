// @ts-check
/**
 * The wire form of opening and closing a Raydium position.
 *
 * The property worth pinning hardest is the **two signers**: the fee payer and the freshly
 * generated NFT mint. Every other solOS instruction has exactly one, so a regression here would
 * be silent everywhere except at the v1 boundary.
 */
import { describe, expect, test } from "bun:test";
import { getU64Decoder } from "@solana/kit";
import { TOKEN_2022_PROGRAM, TOKEN_PROGRAM } from "./raydium-clmm-instruction.js";
import {
  CLOSE_POSITION_DISCRIMINATOR,
  OPEN_POSITION_T22_DISCRIMINATOR,
  closePositionAccounts,
  closePositionData,
  openPositionAccounts,
  openPositionData,
} from "./raydium-clmm-open.js";

const A = {
  payer: "D8ZDjWpJL83gR72eAQDGoRhE8Ryi9Cpamyms74xxevUt",
  nftMint: "66o3kiYMgs7ws8wqMKNdP9yiAZcxr4y5DfjsUiyd9EcS",
  nftAccount: "4uisq4ndD2eLNqaKm27UzQJBKQ4LHs9D92mZg9z5kttd",
  poolState: "3ucNos4NbumPLZNWztqGHNFFgkHeRMBQAVemeeomsUxv",
  protocolPosition: "11i3XCZKADDnubhDskNAv9RSxZa9tQqH5zFVkG8cLvm",
  tickArrayLower: "9fznAX9wi4uhKBytKVdQo4fed6ue3UyYYW7qkZZh1kjV",
  tickArrayUpper: "64HXXxqqxtd8MocvVjBejDGS9hVMTEaVEpYu7MnRiMqk",
  personalPosition: "D3eZCYdUE2uCRkQGx3k1dMTq9UEihhW2CSmdKR7ZQ4dp",
  tokenAccount0: "BHMsVEWTLBdtLNQ98y978RA9km7N8JtnHn1AJWMmHnAz",
  tokenAccount1: "DnK1LXA51TSLeLTHhRAL2fJSwshCfNqiaME6xX3m3cwp",
  tokenVault0: "4ct7br2vTPzfdmY3S5HLtTxcGSBfn6pnw98hsS6v359A",
  tokenVault1: "5it83u57VRrVgc51oNV19TTmAJuffPx5GtGwQr7gQNUo",
  vault0Mint: "So11111111111111111111111111111111111111112",
  vault1Mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
};

describe("raydium open_position_with_token22_nft wire form", () => {
  test("data carries four i32 ticks, a u128, two u64s and two option bytes", () => {
    const data = openPositionData({
      tickLower: -21_878,
      tickUpper: -20_877,
      startLower: -21_900,
      startUpper: -20_880,
      liquidity: 24_012_912_330n,
      amount0Max: 1_000_000n,
      amount1Max: 2_000_000n,
    });
    expect(data.slice(0, 8)).toEqual(Uint8Array.from(OPEN_POSITION_T22_DISCRIMINATOR));
    // 8 + 4*4 + 16 + 8 + 8 + 1 + 1
    expect(data).toHaveLength(58);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getInt32(8, true)).toBe(-21_878);
    expect(view.getInt32(12, true)).toBe(-20_877);
    expect(view.getInt32(16, true)).toBe(-21_900);
    expect(view.getInt32(20, true)).toBe(-20_880);
    expect(view.getBigUint64(24, true)).toBe(24_012_912_330n);
    const u64 = getU64Decoder();
    expect(u64.decode(data.slice(40, 48))).toBe(1_000_000n);
    expect(u64.decode(data.slice(48, 56))).toBe(2_000_000n);
    // with_metadata false, then base_flag None: the Token-2022 form writes no metadata, and the
    // caller's liquidity is already fixed so the program is not asked to size it.
    expect(data[56]).toBe(0);
    expect(data[57]).toBe(0);
  });

  test("negative tick arguments survive as signed values", () => {
    const data = openPositionData({
      tickLower: -443_636,
      tickUpper: -1,
      startLower: -443_640,
      startUpper: -60,
      liquidity: 1n,
      amount0Max: 0n,
      amount1Max: 0n,
    });
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(view.getInt32(8, true)).toBe(-443_636);
    expect(view.getInt32(12, true)).toBe(-1);
  });

  test("20 accounts in the IDL order", () => {
    const accounts = openPositionAccounts(A);
    expect(accounts).toHaveLength(20);
    expect(String(accounts[1]?.address)).toBe(A.payer);
    expect(String(accounts[4]?.address)).toBe(A.poolState);
    expect(String(accounts[8]?.address)).toBe(A.personalPosition);
  });

  // The property that makes this instruction unlike every other one solOS builds.
  test("it carries two signers: the fee payer and the new NFT mint", () => {
    const accounts = openPositionAccounts(A);
    const signers = accounts.filter((account) => account.role >= 2);
    expect(signers).toHaveLength(2);
    expect(String(signers[0]?.address)).toBe(A.payer);
    expect(String(signers[1]?.address)).toBe(A.nftMint);
    // Both are writable signers: the payer funds, the mint is created.
    expect(signers.every((signer) => signer.role === 3)).toBe(true);
  });

  test("the protocol position rides along read-only, as everywhere else", () => {
    expect(openPositionAccounts(A)[5]?.role).toBe(0);
  });
});

/** One close, differing only in the token program the NFT is held under. @param {string} nftProgram */
const closeAccounts = (nftProgram) =>
  closePositionAccounts({
    nftOwner: A.payer,
    nftMint: A.nftMint,
    nftAccount: A.nftAccount,
    personalPosition: A.personalPosition,
    nftProgram,
  });

describe("raydium close_position wire form", () => {
  test("data is the bare discriminator; every guard is on chain", () => {
    expect(closePositionData()).toEqual(Uint8Array.from(CLOSE_POSITION_DISCRIMINATOR));
    expect(closePositionData()).toHaveLength(8);
  });

  test("6 accounts, one signer, and the NFT mint writable so it can be burned", () => {
    const accounts = closeAccounts(TOKEN_2022_PROGRAM);
    expect(accounts).toHaveLength(6);
    expect(accounts.filter((account) => account.role >= 2)).toHaveLength(1);
    expect(accounts[1]).toMatchObject({ role: 1 });
    expect(accounts[3]).toMatchObject({ role: 1 });
  });

  // `open_position_v2` mints a classic SPL NFT and most positions in existence are those, so a
  // close that always named Token-2022 could only ever close the positions solOS opened itself.
  test("the last account is whichever token program holds the NFT", () => {
    expect(String(closeAccounts(TOKEN_PROGRAM)[5]?.address)).toBe(TOKEN_PROGRAM);
    expect(String(closeAccounts(TOKEN_2022_PROGRAM)[5]?.address)).toBe(TOKEN_2022_PROGRAM);
    expect(closeAccounts(TOKEN_PROGRAM)[5]?.role).toBe(0);
  });

  test("and it is the only account that moves with it", () => {
    const classic = closeAccounts(TOKEN_PROGRAM);
    const modern = closeAccounts(TOKEN_2022_PROGRAM);
    expect(classic.slice(0, 5)).toEqual(modern.slice(0, 5));
  });
});
