// @ts-check
/**
 * The deposit half of the executor: turn one `add_liquidity` action into exactly one draft
 * for Submission to seal (ADR-0032), or a typed failure before anything is signed. The plan
 * (guards, fetch orchestration, budget-fit liquidity, derivations) is pure over its reader
 * seam; this module binds the reader to real RPC, proves the funding accounts (creating a
 * missing owner ATA idempotently when the quoted spend on that side is zero), and orders the
 * draft's instructions. A failed plan is a `BuildRejected`: the intent never becomes bytes,
 * and the caller's funds stay put.
 */
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  DEPOSIT_V1_CONFIG,
  increaseLiquidityInstruction,
} from "../liquidity/whirlpool-deposit-instruction.js";
import { depositPlan } from "../liquidity/whirlpool-deposit-plan.js";
import { fundingSide, liquidityRead, setupSides } from "./liquidity-token-accounts.js";
import { draftMeteoraDeposit } from "./meteora-liquidity-build.js";
import { draftRaydiumDeposit } from "./raydium-liquidity-build.js";
import { WSOL_MINT, wrapForSides } from "./wrap-sol.js";

const EXECUTOR = "direct-signer";

/** @typedef {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} DepositPlanOk */
/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos/actions").AddLiquidityAction} AddLiquidityAction */
/** @typedef {import("../submission/seal-draft.js").Draft} Draft */
/** @typedef {Draft["instructions"][number]} SetupInstruction */
/**
 * What a planned deposit carries. `plan` is narrowed to the fields `depositQuoteOf` consumes
 * rather than one venue's plan type, because both venues produce them and nothing downstream
 * reads anything else.
 * @typedef {{ readonly liquidity: bigint; readonly requiredA: bigint; readonly requiredB: bigint;
 *   readonly tokenMaxA: bigint; readonly tokenMaxB: bigint }} DepositQuoteSource
 */
/** @typedef {{ readonly draft: Draft; readonly plan: DepositQuoteSource }} PlannedDeposit */

/**
 * Prove the funding side can pay. A present account with enough needs nothing. A missing side is
 * allowed only when the quote needs nothing from it — the driver then prepends an idempotent ATA
 * create so the instruction's account exists. A short or absent side that IS needed is a typed
 * rejection: a spend from an account that cannot cover it is not simulable honestly.
 * @param {{ read: ReturnType<typeof liquidityRead>; kit: Kit;
 *   plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk;
 *   covered: bigint }} parts `covered` is what a wrap in this transaction adds to the wSOL side
 */
const fundingSetup = ({ read, kit, plan, covered }) =>
  setupSides(read, plan.accounts, ({ row, label }) => {
    const side = sideOf(plan, label);
    return fundingSide({
      kit,
      row,
      label,
      verb: "deposit",
      ...side,
      covered: side.mint === WSOL_MINT ? covered : 0n,
    });
  });

/** What the plan says about one side. @param {DepositPlanOk} plan @param {"A"|"B"} label */
const sideOf = (plan, label) =>
  label === "A"
    ? { required: plan.requiredA, mint: plan.mintA, ata: plan.accounts.tokenOwnerAccountA }
    : { required: plan.requiredB, mint: plan.mintB, ata: plan.accounts.tokenOwnerAccountB };

/**
 * Run the plan against real RPC; its typed rejects surface as values the caller maps to
 * `BuildRejected`, and the reads keep their own `RpcError` channel.
 * @param {Rpc} ctx @param {string} owner @param {AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<import("../liquidity/whirlpool-deposit-plan.js").DepositPlan, import("@solos/core").RpcError>}
 */
const planFromChain = (ctx, owner, action) => {
  const read = liquidityRead(ctx);
  /** @type {import("../liquidity/whirlpool-deposit-plan.js").DepositReader} */
  const reader = {
    rows: (/** @type {readonly string[]} */ accounts) => fetchAccounts(read, accounts),
    custody: (/** @type {string} */ positionMint) => positionNftAccount(read, owner, positionMint),
  };
  return depositPlan({
    reader,
    action: {
      pool: action.pool,
      position: action.position,
      amountA: BigInt(action.amountA),
      amountB: BigInt(action.amountB),
      maxSlippageBps: action.maxSlippageBps,
    },
    owner,
  });
};

/**
 * The deposit's draft: any idempotent ATA creates the funding proof demanded, then exactly one
 * `increase_liquidity`, then the wrap's closes. Submission seals it; nothing here signs.
 * @param {{
 *   plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk;
 *   creates: SetupInstruction[];
 *   closes: SetupInstruction[];
 * }} parts
 * @returns {Draft}
 */
const depositDraft = ({ plan, creates, closes }) => ({
  label: "Orca deposit",
  instructions: [
    ...creates,
    increaseLiquidityInstruction(plan.accounts, {
      liquidity: plan.liquidity,
      tokenMaxA: plan.tokenMaxA,
      tokenMaxB: plan.tokenMaxB,
    }),
    ...closes,
  ],
  config: DEPOSIT_V1_CONFIG,
});

/**
 * The plan's quote as the published venueQuote value: exact amounts and encoded bounds,
 * decimal strings, at the pre-send pool price.
 * @param {DepositQuoteSource} plan
 * @returns {import("@solos/actions").LiquidityDepositQuote}
 */
export const depositQuoteOf = (plan) => ({
  kind: "deposit",
  liquidity: String(plan.liquidity),
  requiredA: String(plan.requiredA),
  requiredB: String(plan.requiredB),
  tokenMaxA: String(plan.tokenMaxA),
  tokenMaxB: String(plan.tokenMaxB),
});

/**
 * Draft one deposit. Orca is assembled here. Raydium and Meteora dispatch to their own
 * builders. Any other protocol is refused before RPC.
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<PlannedDeposit, import("@solos/core").ExecutorError>}
 */
export const draftLiquidityDeposit = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
    if (action.protocol === "raydium") {
      return yield* draftRaydiumDeposit({ ctx, kit }, action);
    }
    if (action.protocol === "meteora") {
      return yield* draftMeteoraDeposit({ ctx, kit }, action);
    }
    if (action.protocol !== "orca") {
      return yield* new UnsupportedAction({
        actionType: `add_liquidity:${action.protocol}`,
        executor: EXECUTOR,
      });
    }
    const plan = yield* planFromChain(ctx, kit.signer.address, action);
    if (plan.status === "reject") {
      return yield* new BuildRejected({ reason: plan.reason });
    }
    const wrap = yield* wrapForSides({
      ctx,
      kit,
      wrapSol: action.wrapSol === true,
      sides: [sideOf(plan, "A"), sideOf(plan, "B")],
    });
    const creates = yield* fundingSetup({
      read: liquidityRead(ctx),
      kit,
      plan,
      covered: wrap.covered,
    });
    const draft = depositDraft({
      plan,
      creates: [...wrap.prefix, ...creates],
      closes: wrap.suffix,
    });
    return { draft, plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityDeposit"));
