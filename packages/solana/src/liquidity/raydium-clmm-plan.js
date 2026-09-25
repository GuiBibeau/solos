// @ts-check
/**
 * Plan one Raydium CLMM add or remove: quote it against the guarded reads and derive the
 * accounts, or refuse before anything is signed.
 *
 * The quote maths is the shared Uniswap-V3 implementation both venues use — see
 * `raydium-clmm-math.test.js` for the three-way check that says why that is sound here.
 */
import { Effect } from "effect";
import { deriveRaydiumAccounts, prepareRaydiumPlan, reject } from "./raydium-clmm-plan-reads.js";
import { depositLiquidityForBudgets } from "./whirlpool-deposit-quote.js";
import { withdrawQuoteForBps } from "./whirlpool-withdraw-quote.js";

/** @typedef {import("./raydium-clmm-plan-reads.js").Reader} Reader */

/** @param {string} owner @param {string} positionAddress @param {any} read */
const accountsFor = (owner, positionAddress, read) =>
  Effect.promise(() =>
    deriveRaydiumAccounts({
      owner,
      positionAddress,
      nftAccount: read.nftAccount,
      position: read.position,
      pool: read.pool,
    }),
  );

/**
 * Plan one add. `pool` in the action must match the pool the position references — a mismatch is
 * a typed refusal, never a silent retarget.
 * @param {{ reader: Reader; owner: string;
 *   action: { pool: string; position: string; amountA: bigint; amountB: bigint;
 *     maxSlippageBps: number } }} input
 */
export const raydiumDepositPlan = ({ reader, owner, action }) =>
  Effect.gen(function* () {
    const read = yield* prepareRaydiumPlan(reader, action.position);
    if (read.status === "reject") return read;
    if (read.position.poolId !== action.pool) {
      return reject("the position belongs to a different pool than the one given");
    }
    const quote = depositLiquidityForBudgets({
      sqrtPrice: read.pool.sqrtPrice,
      tickLowerIndex: read.position.tickLowerIndex,
      tickUpperIndex: read.position.tickUpperIndex,
      amountA: action.amountA,
      amountB: action.amountB,
    });
    if (quote.status === "invalid") return reject(quote.reason);
    if (quote.status === "zero") return reject("the budgets buy no liquidity at this price");
    const accounts = yield* accountsFor(owner, action.position, read);
    return {
      status: /** @type {const} */ ("ok"),
      accounts,
      liquidity: quote.liquidity,
      requiredA: quote.requiredA,
      requiredB: quote.requiredB,
      mintA: read.pool.tokenMint0,
      mintB: read.pool.tokenMint1,
      // The caller's budgets are the on-chain maxima: whatever the price does between planning
      // and landing, the program may never spend more than was allowed.
      tokenMaxA: action.amountA,
      tokenMaxB: action.amountB,
    };
  });

/**
 * Plan one removal. At 10000 bps the stored liquidity is passed verbatim rather than computed:
 * `floor(L * 10000 / 10000)` can lose a unit, and a position left holding dust cannot be closed.
 * @param {{ reader: Reader; owner: string;
 *   action: { position: string; bps: number; maxSlippageBps: number } }} input
 */
export const raydiumWithdrawPlan = ({ reader, owner, action }) =>
  Effect.gen(function* () {
    const read = yield* prepareRaydiumPlan(reader, action.position);
    if (read.status === "reject") return read;
    const quote = withdrawQuoteForBps({
      sqrtPrice: read.pool.sqrtPrice,
      tickLowerIndex: read.position.tickLowerIndex,
      tickUpperIndex: read.position.tickUpperIndex,
      currentLiquidity: read.position.liquidity,
      bps: action.bps,
      maxSlippageBps: action.maxSlippageBps,
    });
    if (quote.status === "invalid" || quote.status === "quoted-zero-min") {
      return reject(quote.reason);
    }
    if (quote.status === "zero") {
      return reject(
        `${action.bps} bps of ${read.position.liquidity} current liquidity computes to zero`,
      );
    }
    const accounts = yield* accountsFor(owner, action.position, read);
    return {
      status: /** @type {const} */ ("ok"),
      accounts,
      // Exact at a full exit, so `close_position` stays reachable afterwards.
      liquidity: action.bps === 10_000 ? read.position.liquidity : quote.liquidity,
      estA: quote.estA,
      estB: quote.estB,
      minA: quote.minA,
      minB: quote.minB,
      mintA: read.pool.tokenMint0,
      mintB: read.pool.tokenMint1,
    };
  });
