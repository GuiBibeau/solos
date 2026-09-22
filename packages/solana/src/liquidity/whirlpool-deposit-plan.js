// @ts-check
/**
 * The pure deposit plan for one `add_liquidity` action: every guard the executor enforces
 * before an instruction may exist, the two-phase account fetch it needs, and the account
 * derivations plus budget-fit liquidity. The injected reader is the only effectful seam —
 * batched row reads and the position-NFT custody probe — so the whole pipeline is testable
 * offline against canned rows. All failures are plain reject reasons; the executor turns
 * them into `BuildRejected` before anything is signed or sent. Derivations here are offline
 * math (position PDA, tick-array PDAs): no randomness, no retries.
 */
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { Effect } from "effect";
import { positionAddress } from "./whirlpool-decode.js";
import { TOKEN_PROGRAM, tickArrayAddress } from "./whirlpool-deposit-instruction.js";
import { depositLiquidityForBudgets } from "./whirlpool-deposit-quote.js";
import {
  guardMints,
  guardPool,
  guardPosition as guardPositionShared,
  reject,
} from "./whirlpool-guards.js";

/** @typedef {{ readonly owner: string; readonly bytes: Uint8Array }} FetchedRow */

/**
 * The effectful seam: batched reads plus the position-NFT custody probe, as Effects so the
 * plan composes without any run call outside a composition root; reads fail with the shared
 * `RpcError`. Custody yields the address of the token account holding the NFT exactly once,
 * or null — the plan passes that actual account to the instruction, whichever it is.
 * @typedef {{ readonly rows: (accounts: readonly string[]) => import("effect").Effect.Effect<ReadonlyArray<FetchedRow | null>, import("@solos/core").RpcError>; readonly custody: (positionMint: string) => import("effect").Effect.Effect<string | null, import("@solos/core").RpcError> }} DepositReader
 */

/** @typedef {{ readonly pool: string; readonly position: string; readonly amountA: bigint; readonly amountB: bigint; readonly maxSlippageBps: number }} DepositIntent */

/** @typedef {{ readonly reader: DepositReader; readonly action: DepositIntent; readonly owner: string }} DepositPlanInput */

/** The resolved accounts, canonical mints, and exact args of one deposit. @typedef {{ readonly status: "ok"; readonly accounts: import("./whirlpool-deposit-instruction.js").DepositAccounts; readonly mintA: string; readonly mintB: string; readonly liquidity: bigint; readonly tokenMaxA: bigint; readonly tokenMaxB: bigint; readonly requiredA: bigint; readonly requiredB: bigint }} DepositPlanOk */

/** @typedef {{ readonly status: "reject"; readonly reason: string }} DepositPlanReject */

/** @typedef {DepositPlanOk | DepositPlanReject} DepositPlan */

/** @typedef {{ readonly layout: { readonly whirlpool: string; readonly positionMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number } }} GuardedPosition */

/** @typedef {{ readonly layout: { readonly sqrtPrice: bigint; readonly tokenMintA: string; readonly tokenMintB: string; readonly tickSpacing: number; readonly tokenVaultA: string; readonly tokenVaultB: string } }} GuardedPool */

/**
 * Guard the position row: present, program-owned, decodable, inside the named pool, and
 * sitting at the position mint's derived PDA is cross-checked later in the plan.
 * @param {import("./whirlpool-guards.js").FetchedRow | null | undefined} row @param {DepositIntent} action @returns {import("./whirlpool-guards.js").GuardedPosition | DepositPlanReject}
 */
const guardPosition = (row, action) => {
  const guarded = guardPositionShared(row);
  if ("reason" in guarded) return guarded;
  if (guarded.layout.whirlpool !== action.pool) {
    return {
      status: "reject",
      reason: "the position belongs to a different pool; pool and position must match",
    };
  }
  return guarded;
};

/** @param {string} owner @param {string} mint @returns {Promise<string>} */
const ata = (owner, mint) =>
  findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(TOKEN_PROGRAM),
  }).then(([pda]) => pda);

/**
 * The encoded on-chain spend bounds: the quoted required spend plus the requested slippage
 * tolerance (rounded up), capped by the absolute budget. A tighter tolerance therefore
 * produces tighter bounds, and the budgets are never exceeded whatever the tolerance.
 * @param {bigint} required @param {bigint} budget @param {number} slippageBps
 * @returns {bigint}
 */
const spendBound = (required, budget, slippageBps) => {
  const tolerance = required * BigInt(10_000 + slippageBps);
  const withTolerance = (tolerance + 9999n) / 10_000n;
  // eslint-disable-next-line unicorn/prefer-math-min-max -- Math.min coerces to Number
  return withTolerance < budget ? withTolerance : budget;
};

/**
 * Derive every instruction account for one planned deposit. The PDAs derive offline; the
 * promises are lifted with `Effect.promise`, which never runs any I/O.
 * @param {{
 *   action: DepositIntent;
 *   owner: string;
 *   position: GuardedPosition["layout"];
 *   pool: GuardedPool["layout"];
 *   positionPda: string;
 *   custodyAccount: string;
 *   quote: import("./whirlpool-deposit-quote.js").DepositQuoted;
 * }} parts
 * @returns {import("effect").Effect.Effect<DepositPlanOk, never>}
 */
const deriveAccounts = ({ action, owner, position, pool, positionPda, custodyAccount, quote }) =>
  Effect.gen(function* () {
    const spacing = pool.tickSpacing;
    const accounts = {
      whirlpool: action.pool,
      positionAuthority: owner,
      position: positionPda,
      positionTokenAccount: custodyAccount,
      tokenOwnerAccountA: yield* Effect.promise(() => ata(owner, pool.tokenMintA)),
      tokenOwnerAccountB: yield* Effect.promise(() => ata(owner, pool.tokenMintB)),
      tokenVaultA: pool.tokenVaultA,
      tokenVaultB: pool.tokenVaultB,
      tickArrayLower: yield* Effect.promise(() =>
        tickArrayAddress(action.pool, getTickArrayStartTickIndex(position.tickLowerIndex, spacing)),
      ),
      tickArrayUpper: yield* Effect.promise(() =>
        tickArrayAddress(action.pool, getTickArrayStartTickIndex(position.tickUpperIndex, spacing)),
      ),
    };
    return {
      status: "ok",
      accounts,
      mintA: pool.tokenMintA,
      mintB: pool.tokenMintB,
      liquidity: quote.liquidity,
      tokenMaxA: spendBound(quote.requiredA, action.amountA, action.maxSlippageBps),
      tokenMaxB: spendBound(quote.requiredB, action.amountB, action.maxSlippageBps),
      requiredA: quote.requiredA,
      requiredB: quote.requiredB,
    };
  });

/**
 * Plan one deposit. Throws nothing; every failure is a typed reject with a fixed reason,
 * and read failures keep the reader's own `RpcError` channel.
 * @param {DepositPlanInput} input
 * @returns {import("effect").Effect.Effect<DepositPlan, import("@solos/core").RpcError>}
 */
export const depositPlan = ({ reader, action, owner }) =>
  Effect.gen(function* () {
    const [positionRow, poolRow] = yield* reader.rows([action.position, action.pool]);
    const position = guardPosition(positionRow, action);
    if ("reason" in position) return position;
    const pool = guardPool(poolRow);
    if ("reason" in pool) return pool;
    const [mintARow, mintBRow] = yield* reader.rows([
      pool.layout.tokenMintA,
      pool.layout.tokenMintB,
    ]);
    const mintRejection = guardMints(mintARow, mintBRow);
    if (mintRejection !== null) return mintRejection;
    const custodyAccount = yield* reader.custody(position.layout.positionMint);
    if (custodyAccount === null) return reject("the signer does not hold the position NFT");
    const positionPda = yield* Effect.promise(() => positionAddress(position.layout.positionMint));
    if (positionPda !== action.position) {
      return reject("position account is not the derived PDA of its position mint");
    }
    const quote = depositLiquidityForBudgets({
      sqrtPrice: pool.layout.sqrtPrice,
      tickLowerIndex: position.layout.tickLowerIndex,
      tickUpperIndex: position.layout.tickUpperIndex,
      amountA: action.amountA,
      amountB: action.amountB,
    });
    if (quote.status === "zero") {
      return reject("the budgets compute to zero liquidity; nothing would be deposited");
    }
    if (quote.status === "invalid") return reject(quote.reason);
    return yield* deriveAccounts({
      action,
      owner,
      position: position.layout,
      pool: pool.layout,
      positionPda,
      custodyAccount,
      quote,
    });
  });
