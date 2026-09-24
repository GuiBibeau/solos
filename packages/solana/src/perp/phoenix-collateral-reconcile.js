// @ts-check
import { TransactionFailed } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { readCollateralTokenBalance } from "./phoenix-collateral-tokens.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("effect").Effect.Effect.Success<ReturnType<typeof import("./phoenix-collateral-build.js").buildCollateral>>} Plan */

/** @param {Plan["facts"]} facts @param {{ wallet: bigint; collateral: bigint; payer: bigint }} after */
const observedDeltas = (facts, after) => {
  const walletDelta = after.wallet - facts.walletUsdc;
  const collateralDelta = after.collateral - BigInt(facts.state.state.quoteLotCollateral);
  return {
    walletDelta,
    collateralDelta,
    reconciliation: {
      kind: /** @type {const} */ ("perp_collateral"),
      walletUsdcDelta: walletDelta.toString(),
      traderCollateralDelta: collateralDelta.toString(),
      payerLamportsDelta: (after.payer - facts.payerLamports).toString(),
    },
  };
};

/** @param {Plan} plan @param {import("@solana/kit").Signature} signature @param {ReturnType<typeof observedDeltas>} observed */
const verifyReceipt = (plan, signature, observed) =>
  Effect.gen(function* () {
    const { walletDelta, collateralDelta } = observed;
    const actualInputDelta = plan.facts.direction === "deposit" ? walletDelta : collateralDelta;
    if (actualInputDelta !== -BigInt(plan.facts.amount))
      return yield* new TransactionFailed({
        signature,
        reason:
          "confirmed transaction input debit differs from the requested fixed input; inspect balances before retrying",
      });
    if ((plan.facts.direction === "deposit" ? collateralDelta : walletDelta) <= 0n)
      return yield* new TransactionFailed({
        signature,
        reason: "confirmed transaction has no observed collateral receipt",
      });
    return observed.reconciliation;
  });

/** Observe actual wallet and trader state after confirmation, or fail with the signature
 * preserved. Differences are read-time deltas; unrelated concurrent transfers can affect them.
 * @param {Rpc} ctx @param {Plan} plan @param {import("@solana/kit").Signature} signature */
export const reconcileCollateral = (ctx, plan, signature) =>
  Effect.gen(function* () {
    const { owner, trader, atas, exchange } = plan.facts;
    const walletAfter = yield* readCollateralTokenBalance(ctx, {
      key: atas.usdc,
      owner,
      mint: exchange.usdcMint,
      required: true,
    });
    const latest = yield* readCollateralTrader(ctx, owner);
    if (latest.trader !== trader)
      return yield* new TransactionFailed({
        signature,
        reason: "Phoenix trader changed during reconciliation",
      });
    const { value: payerAfter } = yield* rpcCall("getBalance", ctx.url, () =>
      ctx.rpc.getBalance(owner, { commitment: "confirmed" }).send(),
    );
    return yield* verifyReceipt(
      plan,
      signature,
      observedDeltas(plan.facts, {
        wallet: walletAfter,
        collateral: BigInt(latest.state.state.quoteLotCollateral),
        payer: payerAfter,
      }),
    );
  }).pipe(
    Effect.mapError((error) =>
      error instanceof TransactionFailed
        ? error
        : new TransactionFailed({
            signature,
            reason:
              "Phoenix transaction confirmed, but actual wallet/trader receipts could not be reconciled",
          }),
    ),
  );
