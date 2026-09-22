// @ts-check
/**
 * The pure withdraw plan for one `remove_liquidity` action: every guard the executor
 * enforces before an instruction may exist, the batched account fetch it needs, and the
 * account derivations plus the bps-fraction liquidity with bounded minimum receipts. The
 * injected reader is the only effectful seam — batched row reads and the position-NFT
 * custody probe — so the whole pipeline is testable offline against canned rows. All
 * failures are plain reject reasons; the executor turns them into `BuildRejected` before
 * anything is signed or sent. Derivations here are offline math: no randomness, no retries.
 */
import { getTickArrayStartTickIndex } from "@orca-so/whirlpools-core";
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import { Effect } from "effect";
import { positionAddress } from "./whirlpool-decode.js";
import { guardMints, guardPool, guardPosition, reject } from "./whirlpool-guards.js";
import { TOKEN_PROGRAM, tickArrayAddress } from "./whirlpool-withdraw-instruction.js";
import { withdrawQuoteForBps } from "./whirlpool-withdraw-quote.js";

/** @typedef {{ readonly owner: string; readonly bytes: Uint8Array }} FetchedRow */

/**
 * The effectful seam: batched reads plus the position-NFT custody probe, as Effects so the
 * plan composes without any run call outside a composition root; reads fail with the shared
 * `RpcError`. Custody yields the address of the token account holding the NFT exactly once,
 * or null — the plan passes that actual account to the instruction, whichever it is.
 * @typedef {{ readonly rows: (accounts: readonly string[]) => import("effect").Effect.Effect<ReadonlyArray<FetchedRow | null>, import("@solos/core").RpcError>; readonly custody: (positionMint: string) => import("effect").Effect.Effect<string | null, import("@solos/core").RpcError> }} WithdrawReader
 */

/** @typedef {{ readonly position: string; readonly bps: number; readonly maxSlippageBps: number }} WithdrawIntent */

/** @typedef {{ readonly reader: WithdrawReader; readonly action: WithdrawIntent; readonly owner: string }} WithdrawPlanInput */

/** The resolved accounts and exact args of one removal. @typedef {{ readonly status: "ok"; readonly accounts: import("./whirlpool-withdraw-instruction.js").WithdrawAccounts; readonly mintA: string; readonly mintB: string; readonly liquidity: bigint; readonly estA: bigint; readonly estB: bigint; readonly minA: bigint; readonly minB: bigint }} WithdrawPlanOk */

/** @typedef {{ readonly status: "reject"; readonly reason: string }} WithdrawPlanReject */

/** @typedef {WithdrawPlanOk | WithdrawPlanReject} WithdrawPlan */

/** @param {string} owner @param {string} mint @returns {Promise<string>} */
const ata = (owner, mint) =>
  findAssociatedTokenPda({
    owner: address(owner),
    mint: address(mint),
    tokenProgram: address(TOKEN_PROGRAM),
  }).then(([pda]) => pda);

/**
 * The two tick-array PDAs a removal touches: the arrays the position's ticks live in.
 * @param {{ readonly whirlpool: string; readonly tickLowerIndex: number; readonly tickUpperIndex: number }} position
 * @param {number} spacing
 * @returns {import("effect").Effect.Effect<{ readonly lower: string; readonly upper: string }, never>}
 */
const tickArrays = (position, spacing) =>
  Effect.all({
    lower: Effect.promise(() =>
      tickArrayAddress(
        position.whirlpool,
        getTickArrayStartTickIndex(position.tickLowerIndex, spacing),
      ),
    ),
    upper: Effect.promise(() =>
      tickArrayAddress(
        position.whirlpool,
        getTickArrayStartTickIndex(position.tickUpperIndex, spacing),
      ),
    ),
  });

/**
 * The instruction accounts for one planned removal: the owner ATA derivations plus the
 * tick-array PDAs, all offline math lifted with `Effect.promise` — no I/O.
 * @param {{
 *   owner: string;
 *   position: { readonly whirlpool: string; readonly positionMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number };
 *   pool: { readonly sqrtPrice: bigint; readonly tokenMintA: string; readonly tokenMintB: string; readonly tickSpacing: number; readonly tokenVaultA: string; readonly tokenVaultB: string };
 *   positionPda: string;
 *   custodyAccount: string;
 * }} parts
 * @returns {import("effect").Effect.Effect<import("./whirlpool-withdraw-instruction.js").WithdrawAccounts, never>}
 */
const planAccounts = ({ owner, position, pool, positionPda, custodyAccount }) =>
  Effect.gen(function* () {
    const arrays = yield* tickArrays(position, pool.tickSpacing);
    return {
      whirlpool: position.whirlpool,
      positionAuthority: owner,
      position: positionPda,
      positionTokenAccount: custodyAccount,
      tokenOwnerAccountA: yield* Effect.promise(() => ata(owner, pool.tokenMintA)),
      tokenOwnerAccountB: yield* Effect.promise(() => ata(owner, pool.tokenMintB)),
      tokenVaultA: pool.tokenVaultA,
      tokenVaultB: pool.tokenVaultB,
      tickArrayLower: arrays.lower,
      tickArrayUpper: arrays.upper,
    };
  });

/**
 * The ok plan for one quoted removal: resolved accounts plus the exact amounts and bounds.
 * @param {{ pool: { readonly tokenMintA: string; readonly tokenMintB: string }; accounts: import("./whirlpool-withdraw-instruction.js").WithdrawAccounts; quote: import("./whirlpool-withdraw-quote.js").WithdrawQuoted }} parts
 * @returns {WithdrawPlanOk}
 */
const planOk = ({ pool, accounts, quote }) => ({
  status: "ok",
  accounts,
  mintA: pool.tokenMintA,
  mintB: pool.tokenMintB,
  liquidity: quote.liquidity,
  estA: quote.estA,
  estB: quote.estB,
  minA: quote.minA,
  minB: quote.minB,
});

/**
 * Fetch and guard the on-chain state one removal acts on: the position, the pool it
 * references, and both pool mints. Every failure is a typed reject.
 * @param {{ reader: WithdrawReader; action: WithdrawIntent }} parts
 * @returns {import("effect").Effect.Effect<
 *   { readonly position: { readonly whirlpool: string; readonly positionMint: string; readonly liquidity: bigint; readonly tickLowerIndex: number; readonly tickUpperIndex: number }; readonly pool: { readonly sqrtPrice: bigint; readonly tokenMintA: string; readonly tokenMintB: string; readonly tickSpacing: number; readonly tokenVaultA: string; readonly tokenVaultB: string } } | WithdrawPlanReject,
 *   import("@solos/core").RpcError
 * >}
 */
const guardState = ({ reader, action }) =>
  Effect.gen(function* () {
    const [positionRow] = yield* reader.rows([action.position]);
    const position = guardPosition(positionRow);
    if ("reason" in position) return position;
    const [poolRow] = yield* reader.rows([position.layout.whirlpool]);
    const pool = guardPool(poolRow);
    if ("reason" in pool) return pool;
    const [mintARow, mintBRow] = yield* reader.rows([
      pool.layout.tokenMintA,
      pool.layout.tokenMintB,
    ]);
    const mintRejection = guardMints(mintARow, mintBRow);
    if (mintRejection !== null) return mintRejection;
    return { position: position.layout, pool: pool.layout };
  });

/**
 * Plan one removal. Throws nothing; every failure is a typed reject with a fixed reason,
 * and read failures keep the reader's own `RpcError` channel.
 * @param {WithdrawPlanInput} input
 * @returns {import("effect").Effect.Effect<WithdrawPlan, import("@solos/core").RpcError>}
 */
export const withdrawPlan = ({ reader, action, owner }) =>
  Effect.gen(function* () {
    const guarded = yield* guardState({ reader, action });
    if ("reason" in guarded) return guarded;
    const { position, pool } = guarded;
    const custodyAccount = yield* reader.custody(position.positionMint);
    if (custodyAccount === null) return reject("the signer does not hold the position NFT");
    const positionPda = yield* Effect.promise(() => positionAddress(position.positionMint));
    if (positionPda !== action.position) {
      return reject("position account is not the derived PDA of its position mint");
    }
    const removal = withdrawQuoteForBps({
      sqrtPrice: pool.sqrtPrice,
      tickLowerIndex: position.tickLowerIndex,
      tickUpperIndex: position.tickUpperIndex,
      currentLiquidity: position.liquidity,
      bps: action.bps,
      maxSlippageBps: action.maxSlippageBps,
    });
    if (removal.status === "zero") {
      return reject(
        `${action.bps} bps of ${position.liquidity} current liquidity computes to zero ` +
          "liquidity; nothing would be removed",
      );
    }
    if (removal.status !== "quoted") return reject(removal.reason);
    const accounts = yield* planAccounts({
      owner,
      position,
      pool,
      positionPda,
      custodyAccount,
    });
    return planOk({ pool, accounts, quote: removal });
  });
