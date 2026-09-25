// @ts-check
/**
 * Seed Raydium CLMM accounts onto an offline Surfnet, so the real adapter can be exercised
 * end to end without a live pool. Byte layouts come from `raydium-clmm-program.js`; the
 * Raydium program is never invoked.
 */

import { address, getAddressEncoder } from "@solana/kit";
import { accountWriter, ataAddress } from "./liquidity-seeds.js";
import { mintBytes, nftBytes, randomAddress } from "./liquidity-token-fixture.js";
import { personalPositionAddress } from "./raydium-clmm-decode.js";
import {
  PERSONAL_POSITION_BYTES,
  PERSONAL_POSITION_DISCRIMINATOR,
  POOL_STATE_DISCRIMINATOR,
  POOL_STATE_OFFSETS,
  RAYDIUM_CLMM_PROGRAM,
} from "./raydium-clmm-program.js";

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const encoder = getAddressEncoder();

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(encoder.encode(address(key)));

/**
 * A seeded pool is written at the full on-chain prefix length rather than the minimum the read
 * happens to need today, so a decoder that later reaches further — the reward slots, for
 * instance — does not silently start refusing every fixture.
 */
const POOL_STATE_BYTES = 904;

/** Sqrt price at tick 0, so a seeded pool sits mid-range by default. */
export const RAYDIUM_SQRT_PRICE_ONE = 1n << 64n;

/**
 * A PoolState long enough for the read, including the reward slots.
 * @param {{ mint0: string; mint1: string; vault0?: string; vault1?: string;
 *   tickSpacing?: number; tickCurrent?: number; sqrtPrice?: bigint;
 *   discriminator?: Uint8Array }} o
 */
export const raydiumPoolBytes = (o) => {
  const bytes = new Uint8Array(POOL_STATE_BYTES);
  bytes.set(o.discriminator ?? new Uint8Array(POOL_STATE_DISCRIMINATOR), 0);
  const view = new DataView(bytes.buffer);
  bytes.set(keyBytes(o.mint0), POOL_STATE_OFFSETS.tokenMint0);
  bytes.set(keyBytes(o.mint1), POOL_STATE_OFFSETS.tokenMint1);
  bytes.set(keyBytes(o.vault0 ?? o.mint0), POOL_STATE_OFFSETS.tokenVault0);
  bytes.set(keyBytes(o.vault1 ?? o.mint1), POOL_STATE_OFFSETS.tokenVault1);
  bytes[POOL_STATE_OFFSETS.mintDecimals0] = 9;
  bytes[POOL_STATE_OFFSETS.mintDecimals1] = 6;
  view.setUint16(POOL_STATE_OFFSETS.tickSpacing, o.tickSpacing ?? 1, true);
  const sqrtPrice = o.sqrtPrice ?? RAYDIUM_SQRT_PRICE_ONE;
  view.setBigUint64(POOL_STATE_OFFSETS.sqrtPriceX64, BigInt.asUintN(64, sqrtPrice), true);
  view.setBigUint64(POOL_STATE_OFFSETS.sqrtPriceX64 + 8, sqrtPrice >> 64n, true);
  view.setInt32(POOL_STATE_OFFSETS.tickCurrent, o.tickCurrent ?? 0, true);
  return bytes;
};

/**
 * A PersonalPositionState.
 * @param {{ poolId: string; nftMint: string; liquidity?: bigint; tickLower?: number;
 *   tickUpper?: number; discriminator?: Uint8Array }} o
 */
export const raydiumPositionBytes = (o) => {
  const bytes = new Uint8Array(PERSONAL_POSITION_BYTES);
  bytes.set(o.discriminator ?? new Uint8Array(PERSONAL_POSITION_DISCRIMINATOR), 0);
  const view = new DataView(bytes.buffer);
  bytes.set(keyBytes(o.nftMint), 9);
  bytes.set(keyBytes(o.poolId), 41);
  view.setInt32(73, o.tickLower ?? -1000, true);
  view.setInt32(77, o.tickUpper ?? 1000, true);
  const liquidity = o.liquidity ?? 0n;
  view.setBigUint64(81, BigInt.asUintN(64, liquidity), true);
  view.setBigUint64(89, liquidity >> 64n, true);
  return bytes;
};

/**
 * Seed one Raydium pool, and its two mints alongside it: the plan reads each mint to learn which
 * token program owns it, so a pool whose mints do not exist is not a pool anything can plan from.
 * @param {string} rpcUrl
 * @param {Parameters<typeof raydiumPoolBytes>[0] & { pool?: string; accountOwner?: string;
 *   mintOwner?: string }} o
 */
export const seedRaydiumPool = async (rpcUrl, o) => {
  const pool = o.pool ?? randomAddress();
  const write = accountWriter(rpcUrl);
  const mintOwner = o.mintOwner ?? TOKEN_PROGRAM;
  await Promise.all([
    write(pool, o.accountOwner ?? RAYDIUM_CLMM_PROGRAM, raydiumPoolBytes(o)),
    write(o.mint0, mintOwner, mintBytes(9)),
    write(o.mint1, mintOwner, mintBytes(6)),
  ]);
  return pool;
};

/**
 * Seed one Raydium position at its derived PDA, with the NFT in the owner's ATA as the custody
 * proof — the same account the instruction passes as `position_nft_account`.
 * @param {string} rpcUrl
 * @param {{ poolId: string; owner?: string; liquidity?: bigint; tickLower?: number;
 *   tickUpper?: number; discriminator?: Uint8Array; accountOwner?: string }} o
 */
export const seedRaydiumPosition = async (rpcUrl, o) => {
  const write = accountWriter(rpcUrl);
  const nftMint = randomAddress();
  if (o.owner !== undefined) {
    await write(await ataAddress(o.owner, nftMint), TOKEN_PROGRAM, nftBytes(o.owner, nftMint));
  }
  const position = await personalPositionAddress(nftMint);
  await write(
    position,
    o.accountOwner ?? RAYDIUM_CLMM_PROGRAM,
    raydiumPositionBytes({ ...o, nftMint }),
  );
  return { position, nftMint };
};
