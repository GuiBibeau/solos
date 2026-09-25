// @ts-check
/**
 * Opening a Raydium CLMM position at a range the caller supplies.
 *
 * Opening is the only solOS path that signs with **two** keys: the configured fee payer, and a
 * freshly generated mint for the position NFT. That keypair is created per transaction, used
 * once, and never stored — it exists only so the program can initialise the mint it is about to
 * hand to the owner. If the transaction fails, nothing is lost; if it lands, the position is
 * identified by its PDA, which the result carries so nothing has to be rediscovered from chain.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { needsBitmapExtension } from "../liquidity/raydium-clmm-accounts.js";
import { decodePoolState } from "../liquidity/raydium-clmm-decode.js";
import {
  openPositionAccounts,
  openPositionData,
  raydiumOpenInstruction,
} from "../liquidity/raydium-clmm-open.js";
import { RAYDIUM_CLMM_PROGRAM } from "../liquidity/raydium-clmm-program.js";
import { depositLiquidityForBudgets } from "../liquidity/whirlpool-deposit-quote.js";
import { liquidityRead } from "./liquidity-token-accounts.js";
import { openParts } from "./raydium-open-parts.js";
import { signRaydiumPosition } from "./raydium-position-sign.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */

/** @param {string} reason */
const rejected = (reason) => new BuildRejected({ reason });

/**
 * Read and guard the pool an open targets. Unlike the other plans there is no position yet, so
 * only the pool is read.
 * @param {Rpc} ctx @param {string} pool
 */
const readPool = (ctx, pool) =>
  Effect.gen(function* () {
    const [row] = yield* fetchAccounts(liquidityRead(ctx), [pool]);
    if (row === null || row === undefined)
      return { ok: /** @type {const} */ (false), reason: "the pool was not found on chain" };
    if (row.owner !== RAYDIUM_CLMM_PROGRAM) {
      return {
        ok: /** @type {const} */ (false),
        reason: "the pool is not owned by the pinned Raydium CLMM program",
      };
    }
    const decoded = decodePoolState(row.bytes);
    return decoded.status === "decoded"
      ? { ok: /** @type {const} */ (true), pool: decoded.layout }
      : { ok: /** @type {const} */ (false), reason: decoded.reason };
  });

/**
 * The pure half of an open: align the range to the pool, refuse a range the instruction cannot
 * address yet, and fit the budgets. All of it is decided before a key is generated.
 * @param {any} action @param {any} pool
 */
const openQuote = (action, pool) => {
  const { tickSpacing } = pool;
  // Refused, never rounded: rounding a range is choosing one, which is the caller's job.
  if (action.tickLower % tickSpacing !== 0 || action.tickUpper % tickSpacing !== 0) {
    return {
      ok: /** @type {const} */ (false),
      reason: `tick range ${action.tickLower}..${action.tickUpper} is not aligned to the pool's tick spacing of ${tickSpacing}`,
    };
  }
  const ticks = { tickLower: action.tickLower, tickUpper: action.tickUpper, tickSpacing };
  if (needsBitmapExtension(ticks)) {
    return {
      ok: /** @type {const} */ (false),
      reason:
        "this range needs the pool's tick-array bitmap extension, which opening does not pass",
    };
  }
  const quote = depositLiquidityForBudgets({
    sqrtPrice: pool.sqrtPrice,
    tickLowerIndex: action.tickLower,
    tickUpperIndex: action.tickUpper,
    amountA: BigInt(action.amountA),
    amountB: BigInt(action.amountB),
  });
  if (quote.status === "quoted")
    return { ok: /** @type {const} */ (true), liquidity: quote.liquidity };
  return {
    ok: /** @type {const} */ (false),
    reason:
      quote.status === "zero"
        ? "the budgets buy no liquidity at this price for this range"
        : quote.reason,
  };
};

/**
 * What the caller records for an open (ADR-0022): the range and the bounds actually encoded. No
 * NFT mint — that key is per build, so the one a simulation shows is not the one execute signs.
 * @param {any} action @param {{ readonly liquidity: bigint }} plan
 */
export const openQuoteOf = (action, plan) => ({
  kind: /** @type {const} */ ("position_open"),
  pool: action.pool,
  tickLower: action.tickLower,
  tickUpper: action.tickUpper,
  liquidity: String(plan.liquidity),
  tokenMaxA: String(action.amountA),
  tokenMaxB: String(action.amountB),
});

/** @param {{ ctx: Rpc; kit: Kit }} deps @param {any} action */
export const buildSignedRaydiumOpen = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const read = yield* readPool(ctx, action.pool);
    if (!read.ok) return yield* rejected(read.reason);
    const quote = openQuote(action, read.pool);
    if (!quote.ok) return yield* rejected(quote.reason);
    const built = yield* Effect.promise(() =>
      openParts({
        owner: kit.signer.address,
        action,
        pool: read.pool,
        tickSpacing: read.pool.tickSpacing,
      }),
    );
    const instruction = raydiumOpenInstruction(
      openPositionAccounts({ ...built.accounts, nftMint: built.nftSigner.address }).map(
        (meta, index) => (index === 2 ? { ...meta, signer: built.nftSigner } : meta),
      ),
      openPositionData({
        tickLower: action.tickLower,
        tickUpper: action.tickUpper,
        startLower: built.startLower,
        startUpper: built.startUpper,
        liquidity: quote.liquidity,
        amount0Max: BigInt(action.amountA),
        amount1Max: BigInt(action.amountB),
      }),
    );
    const signed = yield* signRaydiumPosition({ ctx, kit, instructions: [instruction] });
    return {
      signed,
      plan: {
        position: built.accounts.personalPosition,
        nftMint: built.nftSigner.address,
        liquidity: quote.liquidity,
      },
    };
  }).pipe(Effect.withSpan("executor.buildRaydiumOpen"));
