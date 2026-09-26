// @ts-check
/**
 * Assemble and sign one Meteora DLMM `add_liquidity2` under the local v1 policy. Nothing here
 * can send. A refused plan never becomes bytes. The instruction caps spend at the signed
 * amounts; active-bin drift was already refused in the plan.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { meteoraDepositPlan } from "../liquidity/meteora-dlmm-deposit-plan.js";
import { addLiquidity2Instruction } from "../liquidity/meteora-dlmm-instruction.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { fundingSide, liquidityRead, setupSides } from "./liquidity-token-accounts.js";
import { beginV1Message, rejectionAfterV1Policy, signV1Message } from "./transaction-v1.js";
import { WSOL_MINT, wrapForSides } from "./wrap-sol.js";

/** Pinned CLI `add_liquidity` compute budget, so a live deposit is not compute-starved. */
export const METEORA_DEPOSIT_V1_CONFIG = Object.freeze({
  computeUnitLimit: 1_400_000,
  loadedAccountsDataSizeLimit: 33_554_432,
  priorityFeeLamports: 100_000n,
});

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../liquidity/meteora-dlmm-deposit-plan.js").MeteoraDepositPlan} MeteoraDepositPlan */

/** @param {Rpc} ctx */
const readerFor = (ctx) => ({
  rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(liquidityRead(ctx), accounts),
});

/** @param {Extract<MeteoraDepositPlan, { status: "ok" }>} plan @param {"A" | "B"} label */
const sideSpec = (plan, label) =>
  label === "A"
    ? {
        required: plan.requiredA,
        mint: plan.mintA,
        ata: plan.accounts.userTokenX,
        program: plan.programs.tokenX,
      }
    : {
        required: plan.requiredB,
        mint: plan.mintB,
        ata: plan.accounts.userTokenY,
        program: plan.programs.tokenY,
      };

/**
 * @param {{ read: ReturnType<typeof liquidityRead>; kit: Kit;
 *   plan: Extract<MeteoraDepositPlan, { status: "ok" }>; covered: bigint }} parts
 */
const fundingSetup = ({ read, kit, plan, covered }) =>
  setupSides(
    read,
    {
      tokenOwnerAccountA: plan.accounts.userTokenX,
      tokenOwnerAccountB: plan.accounts.userTokenY,
    },
    ({ row, label }) => {
      const side = sideSpec(plan, label);
      return fundingSide({
        kit,
        row,
        label,
        verb: "deposit",
        ...side,
        covered: side.mint === WSOL_MINT ? covered : 0n,
      });
    },
  );

/**
 * @param {{ ctx: Rpc; kit: Kit; instructions: readonly unknown[] }} parts
 */
const signDeposit = ({ ctx, kit, instructions }) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: METEORA_DEPOSIT_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(/** @type {any} */ (instructions), message),
        ),
      catch: (/** @type {unknown} */ error) => rejectionAfterV1Policy(error),
    });
  });

/** @param {Extract<MeteoraDepositPlan, { status: "ok" }>} plan */
const spendSides = (plan) => [sideSpec(plan, "A"), sideSpec(plan, "B")];

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos/actions").AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<{ signed: Awaited<ReturnType<typeof signV1Message>>; plan: Extract<MeteoraDepositPlan, { status: "ok" }> }, import("@solos/core").ExecutorError>}
 */
export const buildSignedMeteoraDeposit = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const owner = kit.signer.address;
    const plan = yield* meteoraDepositPlan({
      reader: readerFor(ctx),
      owner,
      action: {
        pool: action.pool,
        position: action.position,
        amountA: BigInt(action.amountA),
        amountB: BigInt(action.amountB),
        maxSlippageBps: action.maxSlippageBps,
      },
    });
    if (plan.status === "reject") return yield* new BuildRejected({ reason: plan.reason });
    const wrap = yield* wrapForSides({
      ctx,
      kit,
      wrapSol: action.wrapSol === true,
      sides: spendSides(plan),
    });
    const creates = yield* fundingSetup({
      read: liquidityRead(ctx),
      kit,
      plan,
      covered: wrap.covered,
    });
    const instruction = addLiquidity2Instruction(plan.accounts, {
      amountX: plan.tokenMaxA,
      amountY: plan.tokenMaxB,
      bins: plan.bins,
    });
    const signed = yield* signDeposit({
      ctx,
      kit,
      instructions: [...wrap.prefix, ...creates, instruction, ...wrap.suffix],
    });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildMeteoraDeposit"));
