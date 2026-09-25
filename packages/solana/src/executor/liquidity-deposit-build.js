// @ts-check
/**
 * The deposit half of the executor: turn one `add_liquidity` action into exactly one signed
 * v1 transaction — or a typed failure, before anything is signed. The plan (guards, fetch
 * orchestration, budget-fit liquidity, derivations) is pure over its reader seam; this
 * module binds the reader to real RPC, proves the funding accounts (creating a missing
 * owner ATA idempotently when the quoted spend on that side is zero), and assembles the
 * transaction under the local v1 policy. A failed plan is a `BuildRejected`: the intent
 * never becomes bytes, and the caller's funds stay put.
 */
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { getTokenDecoder } from "@solana-program/token";
import { BuildRejected, UnsupportedAction } from "@solos/core";
import { Effect } from "effect";
import { fetchAccounts, positionNftAccount } from "../liquidity/liquidity-accounts.js";
import {
  DEPOSIT_V1_CONFIG,
  increaseLiquidityInstruction,
} from "../liquidity/whirlpool-deposit-instruction.js";
import { depositPlan } from "../liquidity/whirlpool-deposit-plan.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { createAta, fail, liquidityRead, setupSides } from "./liquidity-token-accounts.js";
import { beginV1Message, rejectionAfterV1Policy, signV1Message } from "./transaction-v1.js";

const EXECUTOR = "direct-signer";
const tokenDecoder = getTokenDecoder();

/** @typedef {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} DepositPlanOk */
/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("../signer/kit-signer.js").KitSignerShape} Kit */
/** @typedef {import("@solos/actions").AddLiquidityAction} AddLiquidityAction */
/** @typedef {Awaited<ReturnType<typeof signV1Message>>} Signed */
/** @typedef {Parameters<typeof appendTransactionMessageInstructions>[0][number]} SetupInstruction */
/** @typedef {{ readonly signed: Signed; readonly plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk }} PlannedDeposit */

/**
 * Prove the funding side can pay. A present account with enough needs nothing. A missing side is
 * allowed only when the quote needs nothing from it — the driver then prepends an idempotent ATA
 * create so the instruction's account exists. A short or absent side that IS needed is a typed
 * rejection: a spend from an account that cannot cover it is not simulable honestly.
 * @param {ReturnType<typeof liquidityRead>} read
 * @param {Kit} kit
 * @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
 */
const fundingSetup = (read, kit, plan) =>
  setupSides(read, plan.accounts, (side) => fundingSide(kit, plan, side));

/** What the plan says about one side. @param {DepositPlanOk} plan @param {"A"|"B"} label */
const sideOf = (plan, label) =>
  label === "A"
    ? { required: plan.requiredA, mint: plan.mintA, target: plan.accounts.tokenOwnerAccountA }
    : { required: plan.requiredB, mint: plan.mintB, target: plan.accounts.tokenOwnerAccountB };

/**
 * One funding side: nothing to do when it already covers the spend, an idempotent create when
 * the quote needs nothing from it, a typed refusal when it is short or absent but needed.
 * @param {Kit} kit @param {DepositPlanOk} plan
 * @param {{ row: import("../liquidity/liquidity-accounts.js").FetchedAccount | null | undefined;
 *   label: "A" | "B" }} side
 */
const fundingSide = (kit, plan, { row, label }) => {
  const { required, mint, target } = sideOf(plan, label);
  const isAbsent = row === null || row === undefined;
  const held = isAbsent ? null : tokenDecoder.decode(row.bytes).amount;
  if (held !== null && held >= required) return Effect.succeed(null);
  if (required > 0n) {
    const detail = isAbsent
      ? "the funding account does not exist"
      : `${held} available, the deposit needs ${required}`;
    return fail(`insufficient token ${label} balance: ${detail}`);
  }
  return Effect.succeed(createAta(kit, mint, target));
};

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
 * Assemble and sign the deposit under the local v1 policy: a fresh blockhash lifetime, any
 * idempotent ATA creates the funding proof demanded, then exactly one `increase_liquidity`.
 * Nothing here can send anything.
 * @param {{
 *   ctx: Rpc;
 *   kit: Kit;
 *   plan: import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk;
 *   creates: SetupInstruction[];
 * }} parts
 * @returns {import("effect").Effect.Effect<Signed, import("@solos/core").BuildRejected | import("@solos/core").RpcError>}
 */
const signDeposit = ({ ctx, kit, plan, creates }) =>
  Effect.gen(function* () {
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", ctx.url, () =>
      ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = setTransactionMessageLifetimeUsingBlockhash(
      lifetime,
      beginV1Message({ feePayerSigner: kit.signer, config: DEPOSIT_V1_CONFIG }),
    );
    return yield* Effect.tryPromise({
      try: () =>
        signV1Message(
          appendTransactionMessageInstructions(
            [
              ...creates,
              increaseLiquidityInstruction(plan.accounts, {
                liquidity: plan.liquidity,
                tokenMaxA: plan.tokenMaxA,
                tokenMaxB: plan.tokenMaxB,
              }),
            ],
            message,
          ),
        ),
      catch: (/** @type {unknown} */ error) => rejectionAfterV1Policy(error),
    });
  });

/**
 * The plan's quote as the published venueQuote value: exact amounts and encoded bounds,
 * decimal strings, at the pre-send pool price.
 * @param {import("../liquidity/whirlpool-deposit-plan.js").DepositPlanOk} plan
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
 * Build and sign one deposit. Refuses anything but an Orca position before any RPC.
 * @param {{ ctx: Rpc; kit: Kit }} deps @param {AddLiquidityAction} action
 * @returns {import("effect").Effect.Effect<PlannedDeposit, import("@solos/core").ExecutorError>}
 */
export const buildSignedLiquidityDeposit = ({ ctx, kit }, action) =>
  Effect.gen(function* () {
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
    const creates = yield* fundingSetup(liquidityRead(ctx), kit, plan);
    const signed = yield* signDeposit({ ctx, kit, plan, creates });
    return { signed, plan };
  }).pipe(Effect.withSpan("executor.buildLiquidityDeposit"));
