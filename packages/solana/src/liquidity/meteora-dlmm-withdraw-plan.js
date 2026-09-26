// @ts-check
/**
 * Plan one Meteora DLMM removal from an existing position: quote per-bin principal,
 * or refuse before anything is signed.
 *
 * The removal is remove-only `rebalance_liquidity` with `NoShrinkBoth`. It does not
 * move `lower_bin_id` / `upper_bin_id` and does not claim fees. `min_withdraw_x/y`
 * are the on-chain floors. Active-bin drift is also encoded as `max_active_bin_slippage`
 * and re-checked here before send.
 */
import { Effect } from "effect";
import { activeBinTolerance } from "./meteora-dlmm-allocate.js";
import { driftOf, mintsOf, pairOf } from "./meteora-dlmm-deposit-guards.js";
import { rebalanceAccounts } from "./meteora-dlmm-rebalance-accounts.js";
import { quoteRemoval } from "./meteora-dlmm-withdraw-math.js";
import {
  indexesOfBins,
  ownedMeteoraPosition,
  slotsForOccupied,
} from "./meteora-dlmm-withdraw-read.js";

/** @typedef {import("./meteora-dlmm-deposit-accounts.js").Reader} Reader */
/** @typedef {import("./meteora-dlmm-rebalance.js").RebalanceAccounts} RebalanceAccounts */
/** @typedef {import("./meteora-dlmm-withdraw-math.js").ShareBin} ShareBin */
/** @typedef {{ readonly position: string; readonly bps: number; readonly maxSlippageBps: number }} WithdrawAction */
/** @typedef {{ readonly status: "reject"; readonly reason: string }} Rejected */
/**
 * @typedef {{
 *   readonly status: "ok";
 *   readonly accounts: RebalanceAccounts;
 *   readonly removes: readonly { readonly binId: number; readonly bps: number }[];
 *   readonly activeId: number;
 *   readonly maxActiveBinSlippage: number;
 *   readonly liquidity: bigint;
 *   readonly estA: bigint;
 *   readonly estB: bigint;
 *   readonly minA: bigint;
 *   readonly minB: bigint;
 *   readonly mintA: string;
 *   readonly mintB: string;
 *   readonly programs: { readonly tokenX: string; readonly tokenY: string };
 *   readonly remaining: readonly ShareBin[];
 * }} MeteoraWithdrawOk
 */
/** @typedef {MeteoraWithdrawOk | Rejected} MeteoraWithdrawPlan */
/** @typedef {{ reader: Reader; owner: string; action: WithdrawAction }} PlanInput */
/**
 * @typedef {{
 *   layout: import("./meteora-dlmm-decode.js").MeteoraPositionLayout;
 *   pair: import("./meteora-dlmm-deposit-guards.js").PairHeld;
 *   mints: import("./meteora-dlmm-deposit-guards.js").MintPrograms;
 *   slots: { addressOf: Map<number, string>; slotFor: (binId: number) => import("./meteora-dlmm-decode.js").MeteoraBinSlot | undefined };
 * }} PlanRead
 */
/**
 * @typedef {{
 *   status: "ok"; liquidity: bigint; estA: bigint; estB: bigint; minA: bigint; minB: bigint;
 *   removes: readonly { binId: number; bps: number }[]; remaining: readonly ShareBin[];
 * }} QuotedOk
 */
/** @param {string} reason @returns {Rejected} */
const reject = (reason) => ({ status: "reject", reason });

/** @param {number} bps @param {bigint} liquidity */
const zeroLiquidity = (bps, liquidity) =>
  reject(`${bps} bps of ${liquidity} current liquidity computes to zero liquidity`);

/** @param {PlanInput} input */
const readStage = (input) =>
  Effect.gen(function* () {
    const position = yield* ownedMeteoraPosition({
      reader: input.reader,
      position: input.action.position,
      owner: input.owner,
    });
    if (position.status === "reject") return position;
    if (position.layout.bins.length === 0) {
      return zeroLiquidity(input.action.bps, position.layout.liquidity);
    }
    return yield* fundedRead(input, position.layout);
  });

/**
 * @param {PlanInput} input
 * @param {import("./meteora-dlmm-decode.js").MeteoraPositionLayout} layout
 */
const fundedRead = (input, layout) =>
  Effect.gen(function* () {
    const pair = yield* pairOf(input.reader, layout.lbPair);
    if (pair.status === "reject") return pair;
    const mints = yield* mintsOf(input.reader, pair.layout);
    if (mints.status === "reject") return mints;
    const slots = yield* slotsForOccupied(input.reader, layout.lbPair, layout.bins);
    if (slots.status === "reject") return slots;
    return { layout, pair, mints, slots };
  });

/** @param {PlanInput} input @param {PlanRead} read */
const quotedOf = (input, read) =>
  quoteRemoval({
    bins: read.layout.bins,
    bps: input.action.bps,
    maxSlippageBps: input.action.maxSlippageBps,
    slotFor: read.slots.slotFor,
  });

/**
 * Bin arrays the removes actually touch, in index order.
 * @param {{ addressOf: Map<number, string> }} slots
 * @param {readonly { binId: number }[]} removes
 */
const coveredArrays = (slots, removes) => {
  /** @type {string[]} */
  const binArrays = [];
  for (const index of indexesOfBins(removes)) {
    const found = slots.addressOf.get(index);
    if (found === undefined) return null;
    binArrays.push(found);
  }
  return binArrays;
};

/**
 * @param {{ input: PlanInput; read: PlanRead; quoted: QuotedOk; tolerance: number;
 *   binArrays: readonly string[] }} parts
 */
const assembled = ({ input, read, quoted, tolerance, binArrays }) =>
  Effect.gen(function* () {
    const drift = yield* driftOf({
      reader: input.reader,
      lbPair: read.layout.lbPair,
      activeId: read.pair.layout.activeId,
      binStep: read.pair.layout.binStep,
      maxSlippageBps: input.action.maxSlippageBps,
    });
    if (drift.status === "reject") return drift;
    const accounts = yield* Effect.promise(() =>
      rebalanceAccounts({
        owner: input.owner,
        positionAddress: input.action.position,
        position: read.layout,
        pair: read.pair.layout,
        programs: { tokenX: read.mints.tokenX, tokenY: read.mints.tokenY },
        indexes: indexesOfBins(quoted.removes),
        binArrays,
      }),
    );
    return okPlan({ read, quoted, accounts, tolerance });
  });

/**
 * @param {{ read: PlanRead; quoted: QuotedOk; accounts: RebalanceAccounts; tolerance: number }} parts
 * @returns {MeteoraWithdrawOk}
 */
const okPlan = ({ read, quoted, accounts, tolerance }) => ({
  status: "ok",
  accounts,
  removes: quoted.removes,
  activeId: read.pair.layout.activeId,
  maxActiveBinSlippage: tolerance,
  liquidity: quoted.liquidity,
  estA: quoted.estA,
  estB: quoted.estB,
  minA: quoted.minA,
  minB: quoted.minB,
  mintA: read.pair.layout.tokenMintX,
  mintB: read.pair.layout.tokenMintY,
  programs: { tokenX: read.mints.tokenX, tokenY: read.mints.tokenY },
  remaining: quoted.remaining,
});

/** @param {PlanInput} input @param {PlanRead} read */
const finishPlan = (input, read) =>
  Effect.gen(function* () {
    const quoted = quotedOf(input, read);
    if (quoted.status === "reject") return quoted;
    const tolerance = activeBinTolerance(input.action.maxSlippageBps, read.pair.layout.binStep);
    if (tolerance === null) return reject("the pair bin step is zero");
    const binArrays = coveredArrays(read.slots, quoted.removes);
    if (binArrays === null) return reject("referenced bin array is missing");
    return yield* assembled({ input, read, quoted, tolerance, binArrays });
  });

/**
 * @param {PlanInput} input
 * @returns {import("effect").Effect.Effect<MeteoraWithdrawPlan, import("@solos/core").RpcError>}
 */
export const meteoraWithdrawPlan = (input) =>
  Effect.gen(function* () {
    const read = yield* readStage(input);
    if ("status" in read) return read;
    return yield* finishPlan(input, read);
  });
