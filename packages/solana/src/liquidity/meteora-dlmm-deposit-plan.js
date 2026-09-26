// @ts-check
/**
 * Plan one Meteora DLMM deposit into an existing position: quote ADR-0022 amounts across the
 * bins the position already holds, or refuse before anything is signed.
 *
 * The deposit does not choose a strategy and does not move `lower_bin_id` / `upper_bin_id`.
 * Spend is capped by the signed `amount_x` / `amount_y`. Active-bin drift is checked here,
 * before send, and is not an instruction argument.
 */
import { Effect } from "effect";
import { allocateDeposit } from "./meteora-dlmm-allocate.js";
import {
  activeReserves,
  depositAccounts,
  requireBinArrays,
  windowIndexes,
} from "./meteora-dlmm-deposit-accounts.js";
import { driftOf, mintsOf, pairOf, positionOf } from "./meteora-dlmm-deposit-guards.js";

/** @typedef {import("./meteora-dlmm-deposit-accounts.js").Reader} Reader */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} MeteoraPositionLayout */
/** @typedef {import("./meteora-dlmm-decode.js").MeteoraPairLayout} MeteoraPairLayout */
/** @typedef {import("./meteora-dlmm-instruction.js").AddLiquidity2Accounts} AddLiquidity2Accounts */
/** @typedef {import("./meteora-dlmm-instruction.js").BinDistribution} BinDistribution */
/** @typedef {{ readonly pool: string; readonly position: string; readonly amountA: bigint; readonly amountB: bigint; readonly maxSlippageBps: number }} DepositAction */
/**
 * @typedef {{
 *   readonly status: "ok";
 *   readonly accounts: AddLiquidity2Accounts;
 *   readonly liquidity: bigint;
 *   readonly requiredA: bigint;
 *   readonly requiredB: bigint;
 *   readonly tokenMaxA: bigint;
 *   readonly tokenMaxB: bigint;
 *   readonly mintA: string;
 *   readonly mintB: string;
 *   readonly bins: readonly BinDistribution[];
 *   readonly programs: { readonly tokenX: string; readonly tokenY: string };
 * } | { readonly status: "reject"; readonly reason: string }} MeteoraDepositPlan
 */
/** @typedef {{ reader: Reader; owner: string; action: DepositAction }} PlanInput */
/** @typedef {{ position: { layout: MeteoraPositionLayout }; pair: { layout: MeteoraPairLayout }; mints: { tokenX: string; tokenY: string }; reserves: { reserveX: bigint; reserveY: bigint } }} PlanRead */

/**
 * @param {{ position: MeteoraPositionLayout; pair: MeteoraPairLayout;
 *   reserves: { reserveX: bigint; reserveY: bigint }; action: DepositAction }} input
 */
const quoteOf = ({ position, pair, reserves, action }) => {
  const result = allocateDeposit({
    lowerBinId: position.lowerBinId,
    upperBinId: position.upperBinId,
    activeId: pair.activeId,
    binStep: pair.binStep,
    amountX: action.amountA,
    amountY: action.amountB,
    reserveX: reserves.reserveX,
    reserveY: reserves.reserveY,
  });
  if (result.status === "reject") return result;
  return {
    status: /** @type {const} */ ("ok"),
    liquidity: result.allocation.liquidity,
    requiredA: result.allocation.spentX,
    requiredB: result.allocation.spentY,
    tokenMaxA: result.allocation.amountX,
    tokenMaxB: result.allocation.amountY,
    bins: result.allocation.bins,
  };
};

/** @param {PlanInput} input */
const readStage = (input) =>
  Effect.gen(function* () {
    const position = yield* positionOf({
      reader: input.reader,
      position: input.action.position,
      owner: input.owner,
      pool: input.action.pool,
    });
    if (position.status === "reject") return position;
    const pair = yield* pairOf(input.reader, position.layout.lbPair);
    if (pair.status === "reject") return pair;
    const mints = yield* mintsOf(input.reader, pair.layout);
    if (mints.status === "reject") return mints;
    const reserves = yield* activeReserves({
      reader: input.reader,
      position: position.layout,
      activeId: pair.layout.activeId,
    });
    if (reserves.status === "reject") return reserves;
    return { position, pair, mints, reserves };
  });

/**
 * @param {PlanInput} input
 * @param {PlanRead} read
 */
const finishPlan = (input, read) =>
  Effect.gen(function* () {
    const quoted = quoteOf({
      position: read.position.layout,
      pair: read.pair.layout,
      reserves: read.reserves,
      action: input.action,
    });
    if (quoted.status === "reject") return quoted;
    const drift = yield* driftOf({
      reader: input.reader,
      lbPair: read.position.layout.lbPair,
      activeId: read.pair.layout.activeId,
      binStep: read.pair.layout.binStep,
      maxSlippageBps: input.action.maxSlippageBps,
    });
    if (drift.status === "reject") return drift;
    const arrays = yield* arraysOf(input.reader, read.position.layout);
    if (arrays.status === "reject") return arrays;
    const accounts = yield* Effect.promise(() =>
      depositAccounts({
        owner: input.owner,
        positionAddress: input.action.position,
        position: read.position.layout,
        pair: read.pair.layout,
        programs: read.mints,
        binArrays: arrays.addresses,
      }),
    );
    return assembled(read, quoted, accounts);
  });

/** @param {Reader} reader @param {MeteoraPositionLayout} position */
const arraysOf = (reader, position) =>
  requireBinArrays(reader, position.lbPair, windowIndexes(position));

/**
 * @param {PlanRead} read
 * @param {{ liquidity: bigint; requiredA: bigint; requiredB: bigint; tokenMaxA: bigint; tokenMaxB: bigint; bins: readonly BinDistribution[] }} quoted
 * @param {AddLiquidity2Accounts} accounts
 */
const assembled = (read, quoted, accounts) => ({
  status: /** @type {const} */ ("ok"),
  accounts,
  liquidity: quoted.liquidity,
  requiredA: quoted.requiredA,
  requiredB: quoted.requiredB,
  tokenMaxA: quoted.tokenMaxA,
  tokenMaxB: quoted.tokenMaxB,
  mintA: read.pair.layout.tokenMintX,
  mintB: read.pair.layout.tokenMintY,
  bins: quoted.bins,
  programs: { tokenX: read.mints.tokenX, tokenY: read.mints.tokenY },
});

/**
 * @param {PlanInput} input
 * @returns {import("effect").Effect.Effect<MeteoraDepositPlan, import("@solos/core").RpcError>}
 */
export const meteoraDepositPlan = (input) =>
  Effect.gen(function* () {
    const read = yield* readStage(input);
    if ("status" in read) return read;
    return yield* finishPlan(input, read);
  });
