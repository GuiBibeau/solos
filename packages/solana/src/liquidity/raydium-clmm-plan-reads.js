// @ts-check
/**
 * The chain reads and account derivations both Raydium plans share: guard the position and its
 * pool, prove NFT custody, and derive every account the instruction lists.
 *
 * Pure over its reader seam, so each refusal is testable without a chain.
 */
import { address, getAddressEncoder, getProgramDerivedAddress } from "@solana/kit";
import { Effect } from "effect";
import {
  bitmapExtensionAddress,
  needsBitmapExtension,
  protocolPositionAddress,
  tickArrayAddress,
  tickArrayStartIndex,
} from "./raydium-clmm-accounts.js";
import { decodePersonalPosition, decodePoolState } from "./raydium-clmm-decode.js";
import { ATA_PROGRAM } from "./raydium-clmm-instruction.js";
import { RAYDIUM_CLMM_PROGRAM } from "./raydium-clmm-program.js";

const addressBytes = getAddressEncoder();

/** @param {string} key */
const keyBytes = (key) => new Uint8Array(addressBytes.encode(address(key)));

/** @param {string} reason */
export const reject = (reason) => ({ status: /** @type {const} */ ("reject"), reason });

/** The owner's associated token account for one mint under one token program. */
/** @param {string} owner @param {string} mint @param {string} tokenProgram */
export const ata = (owner, mint, tokenProgram) =>
  getProgramDerivedAddress({
    programAddress: address(ATA_PROGRAM),
    seeds: [keyBytes(owner), keyBytes(tokenProgram), keyBytes(mint)],
  }).then(([key]) => key);

/**
 * The seam the plans read through: batched account rows and an NFT custody answer. Typed rather
 * than `any` so the plans keep a real error channel instead of collapsing to `unknown`.
 * @typedef {{
 *   rows: (accounts: readonly string[]) => import("effect").Effect.Effect<
 *     ReadonlyArray<{ owner: string; bytes: Uint8Array } | null | undefined>,
 *     import("@solos/core").RpcError>;
 *   custody: (mint: string) => import("effect").Effect.Effect<
 *     string | null | undefined, import("@solos/core").RpcError>;
 * }} Reader
 */

/** @param {Reader} reader @param {{ account: string; absent: string; foreign: string }} what */
const guardedRow = (reader, what) =>
  Effect.map(reader.rows([what.account]), ([row]) => {
    if (row === null || row === undefined) return reject(what.absent);
    if (row.owner !== RAYDIUM_CLMM_PROGRAM) return reject(what.foreign);
    return { status: /** @type {const} */ ("ok"), bytes: row.bytes };
  });

/**
 * Guard the position, its pool, and the owner's custody of the position NFT. Everything both
 * directions need before they diverge into their own quote.
 * @param {Reader} reader @param {string} position
 */
export const prepareRaydiumPlan = (reader, position) =>
  Effect.gen(function* () {
    const positionRow = yield* guardedRow(reader, {
      account: position,
      absent: "no account at the position address",
      foreign: "position account is not owned by the pinned Raydium CLMM program",
    });
    if (positionRow.status === "reject") return positionRow;
    const decoded = decodePersonalPosition(positionRow.bytes);
    if (decoded.status !== "decoded") return reject(decoded.reason);

    const poolRow = yield* guardedRow(reader, {
      account: decoded.layout.poolId,
      absent: "the position's pool is missing",
      foreign: "the position's pool is not owned by the pinned Raydium CLMM program",
    });
    if (poolRow.status === "reject") return poolRow;
    const pool = decodePoolState(poolRow.bytes);
    if (pool.status !== "decoded") return reject(pool.reason);

    const nftAccount = yield* reader.custody(decoded.layout.nftMint);
    if (nftAccount === null || nftAccount === undefined) {
      return reject("owner does not hold the position NFT");
    }
    const programs = yield* mintPrograms(reader, pool.layout);
    if ("status" in programs) return programs;
    return {
      status: /** @type {const} */ ("ok"),
      position: decoded.layout,
      pool: pool.layout,
      nftAccount,
      programs,
    };
  });

/**
 * Each pool mint's own token program. A Token-2022 pool mint derives a different associated
 * account than the classic one, and the v2 instructions exist precisely so such a pool works —
 * deriving both against the classic program would target accounts the program rejects.
 * @param {Pick<Reader, "rows">} reader @param {{ tokenMint0: string; tokenMint1: string }} pool
 */
export const mintPrograms = (reader, pool) =>
  Effect.gen(function* () {
    const [row0, row1] = yield* reader.rows([pool.tokenMint0, pool.tokenMint1]);
    if (row0 === null || row0 === undefined) {
      return reject(`the pool's mint ${pool.tokenMint0} is missing`);
    }
    if (row1 === null || row1 === undefined) {
      return reject(`the pool's mint ${pool.tokenMint1} is missing`);
    }
    return { token0: row0.owner, token1: row1.owner };
  });

/**
 * Every account the instruction lists, derived from the guarded reads. The bitmap extension is
 * included only when the arithmetic says the position's arrays fall outside the default bitmap.
 * @param {{ owner: string; positionAddress: string; nftAccount: string;
 *   position: import("./raydium-clmm-decode.js").RaydiumPositionLayout;
 *   pool: import("./raydium-clmm-decode.js").RaydiumPoolLayout;
 *   programs: { token0: string; token1: string } }} parts
 */
export const deriveRaydiumAccounts = async ({
  owner,
  positionAddress,
  nftAccount,
  position,
  pool,
  programs,
}) => {
  const poolId = position.poolId;
  const { tickLowerIndex: lower, tickUpperIndex: upper } = position;
  const spacing = pool.tickSpacing;
  const [tickArrayLower, tickArrayUpper, protocolPosition, extension, account0, account1] =
    await Promise.all([
      tickArrayAddress(poolId, tickArrayStartIndex(lower, spacing)),
      tickArrayAddress(poolId, tickArrayStartIndex(upper, spacing)),
      protocolPositionAddress(poolId, lower, upper),
      bitmapExtensionAddress(poolId),
      ata(owner, pool.tokenMint0, programs.token0),
      ata(owner, pool.tokenMint1, programs.token1),
    ]);
  const wide = needsBitmapExtension({ tickLower: lower, tickUpper: upper, tickSpacing: spacing });
  return {
    nftOwner: owner,
    nftAccount,
    poolState: poolId,
    protocolPosition,
    personalPosition: positionAddress,
    tickArrayLower,
    tickArrayUpper,
    tokenAccount0: account0,
    tokenAccount1: account1,
    tokenVault0: pool.tokenVault0,
    tokenVault1: pool.tokenVault1,
    vault0Mint: pool.tokenMint0,
    vault1Mint: pool.tokenMint1,
    ...(wide && { bitmapExtension: extension }),
  };
};

/**
 * The reward groups `decrease_liquidity_v2` requires: one `(vault, recipient, mint)` triple per
 * initialized pool reward, in reward index order. The count must match exactly — a pool with a
 * reward and no groups fails the removal even when only liquidity was wanted.
 *
 * Each recipient is the owner's ATA for that reward mint, derived against the mint's own token
 * program: a Token-2022 reward would otherwise derive an address the program rejects.
 * @param {Reader} reader @param {string} owner
 * @param {ReadonlyArray<{ mint: string; vault: string }>} rewards
 */
export const rewardGroups = (reader, owner, rewards) =>
  Effect.gen(function* () {
    if (rewards.length === 0) return [];
    const mintRows = yield* reader.rows(rewards.map((reward) => reward.mint));
    const groups = [];
    for (const [index, reward] of rewards.entries()) {
      const row = mintRows[index];
      if (row === null || row === undefined) {
        return reject(`the pool's reward mint ${reward.mint} is missing`);
      }
      const recipient = yield* Effect.promise(() => ata(owner, reward.mint, row.owner));
      groups.push({ vault: reward.vault, recipient, mint: reward.mint, program: row.owner });
    }
    return groups;
  });
