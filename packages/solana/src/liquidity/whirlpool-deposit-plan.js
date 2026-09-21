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
import { decodePosition, decodeWhirlpool, positionAddress } from "./whirlpool-decode.js";
import { TOKEN_PROGRAM, tickArrayAddress } from "./whirlpool-deposit-instruction.js";
import { depositLiquidityForBudgets } from "./whirlpool-deposit-quote.js";
import { WHIRLPOOL_PROGRAM } from "./whirlpool-program.js";

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

/** Tick spacings the pinned program mints pools with; anything else is corrupt state. */
const TICK_SPACINGS = new Set([1, 8, 16, 32, 64, 128, 256]);

/** @param {string} reason @returns {DepositPlanReject} */
const reject = (reason) => ({ status: "reject", reason });

/**
 * Guard the position row: present, program-owned, decodable, inside the named pool, and
 * sitting at the position mint's derived PDA.
 * @param {FetchedRow | null | undefined} row @param {DepositIntent} action @returns {GuardedPosition | DepositPlanReject}
 */
const guardPosition = (row, action) => {
  if (row === null || row === undefined) return reject("no account at the position address");
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return reject("position account is not owned by the pinned Whirlpool program");
  }
  const guarded = decodePosition(row.bytes);
  if (guarded.status === "corrupt") {
    return reject(`position account has the wrong layout: ${guarded.reason}`);
  }
  if (guarded.layout.whirlpool !== action.pool) {
    return reject("the position belongs to a different pool; pool and position must match");
  }
  return { layout: guarded.layout };
};

/**
 * Guard the pool row: present, program-owned, decodable, with a real tick spacing (zero
 * would panic the pinned tick-array math instead of failing typed).
 * @param {FetchedRow | null | undefined} row @returns {GuardedPool | DepositPlanReject}
 */
const guardPool = (row) => {
  if (row === null || row === undefined) return reject("the position's pool is missing");
  if (row.owner !== WHIRLPOOL_PROGRAM) {
    return reject("the position's pool is not owned by the pinned Whirlpool program");
  }
  const guarded = decodeWhirlpool(row.bytes);
  if (guarded.status === "corrupt") {
    return reject(`the position's pool has the wrong layout: ${guarded.reason}`);
  }
  if (!TICK_SPACINGS.has(guarded.layout.tickSpacing)) {
    return reject(`pool tick spacing ${guarded.layout.tickSpacing} is not a supported value`);
  }
  return { layout: guarded.layout };
};

/**
 * Guard the two mint rows: present and classic-SPL, so the fixed token program and the
 * quote math apply; token-2022 venues (including transfer-fee mints) are rejected.
 * @param {FetchedRow | null | undefined} a @param {FetchedRow | null | undefined} b @returns {DepositPlanReject | null}
 */
const guardMints = (a, b) => {
  if (a === null || a === undefined) return reject("token A mint is missing");
  if (b === null || b === undefined) return reject("token B mint is missing");
  if (a.owner !== TOKEN_PROGRAM) {
    return reject("token A mint is not a classic SPL token mint; token-2022 is rejected");
  }
  if (b.owner !== TOKEN_PROGRAM) {
    return reject("token B mint is not a classic SPL token mint; token-2022 is rejected");
  }
  return null;
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
