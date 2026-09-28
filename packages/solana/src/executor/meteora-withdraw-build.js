// @ts-check
/**
 * Draft one Meteora DLMM remove-only `rebalance_liquidity` for Submission to seal
 * (ADR-0032). Nothing here signs or sends. A refused plan never becomes bytes. The instruction
 * floors receipts at `min_withdraw_x/y` and does not claim fees or rewards.
 */
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts } from "../liquidity/liquidity-accounts.js";
import { rebalanceLiquidityInstruction } from "../liquidity/meteora-dlmm-rebalance.js";
import { meteoraWithdrawPlan } from "../liquidity/meteora-dlmm-withdraw-plan.js";
import { liquidityRead, receivingSide, setupSides } from "./liquidity-token-accounts.js";
import { METEORA_DEPOSIT_V1_CONFIG } from "./meteora-liquidity-build.js";

/** Same pinned budget as a Meteora deposit, so a live removal is not compute-starved. */
const WITHDRAW_V1_CONFIG = METEORA_DEPOSIT_V1_CONFIG;

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("../liquidity/meteora-dlmm-withdraw-plan.js").MeteoraWithdrawOk} MeteoraWithdrawOk */

/** @param {Rpc} ctx */
const readerFor = (ctx) => ({
  rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(liquidityRead(ctx), accounts),
});

/** @param {MeteoraWithdrawOk} plan @param {"A" | "B"} label */
const sideOf = (plan, label) =>
  label === "A"
    ? {
        owed: plan.minA,
        mint: plan.mintA,
        ata: plan.accounts.userTokenX,
        program: plan.programs.tokenX,
      }
    : {
        owed: plan.minB,
        mint: plan.mintB,
        ata: plan.accounts.userTokenY,
        program: plan.programs.tokenY,
      };

/**
 * A receiving account must exist when the quote owes it tokens. An absent side the
 * quote pays nothing is created idempotently; its rent is not principal.
 * @param {{ read: ReturnType<typeof liquidityRead>; kit: Kit; plan: MeteoraWithdrawOk }} parts
 */
const receiptSetup = ({ read, kit, plan }) =>
  setupSides(
    read,
    {
      tokenOwnerAccountA: plan.accounts.userTokenX,
      tokenOwnerAccountB: plan.accounts.userTokenY,
    },
    ({ row, label }) => receivingSide({ kit, row, label, ...sideOf(plan, label) }),
  );

/**
 * @param {MeteoraWithdrawOk} plan
 * @param {ReadonlyArray<import("../submission/seal-draft.js").Draft["instructions"][number]>} creates
 * @returns {import("../submission/seal-draft.js").Draft}
 */
const withdrawDraft = (plan, creates) => ({
  label: "Meteora withdraw",
  instructions: [
    ...creates,
    rebalanceLiquidityInstruction(plan.accounts, {
      activeId: plan.activeId,
      maxActiveBinSlippage: plan.maxActiveBinSlippage,
      minWithdrawX: plan.minA,
      minWithdrawY: plan.minB,
      removes: plan.removes,
    }),
  ],
  config: WITHDRAW_V1_CONFIG,
});

/**
 * @param {{ ctx: Rpc; kit: Kit }} deps
 * @param {import("@solos/actions").RemoveLiquidityAction} action
 * @returns {import("effect").Effect.Effect<{ draft: import("../submission/seal-draft.js").Draft; plan: MeteoraWithdrawOk }, import("@solos/core").ExecutorError>}
 */
export const draftMeteoraWithdraw = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    const plan = yield* meteoraWithdrawPlan({
      reader: readerFor(ctx),
      owner: kit.signer.address,
      action: {
        position: action.position,
        bps: action.bps,
        maxSlippageBps: action.maxSlippageBps,
      },
    });
    if (plan.status === "reject") return yield* new BuildRejected({ reason: plan.reason });
    const creates = yield* receiptSetup({ read: liquidityRead(ctx), kit, plan });
    return { draft: withdrawDraft(plan, /** @type {any} */ (creates)), plan };
  }).pipe(Effect.withSpan("executor.buildMeteoraWithdraw"));
