// @ts-check
import {
  appendTransactionMessageInstructions,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { ActionSchema } from "@solos/actions";
import { BuildRejected } from "@solos/core";
import { Effect } from "effect";
import {
  beginV1Message,
  rejectionAfterV1Policy,
  signV1Message,
} from "../executor/transaction-v1.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { readCollateralExchange } from "./phoenix-collateral-exchange-live.js";
import { collateralInstructions } from "./phoenix-collateral-instructions.js";
import {
  collateralAtas,
  readCollateralTokenBalance,
  requireCollateralMint,
} from "./phoenix-collateral-tokens.js";
import { assertWithdrawalReady } from "./phoenix-collateral-withdraw.js";

/** @typedef {{config: import("./phoenix-api.js").PhoenixConfig,ctx: import("../rpc/solana-rpc.js").SolanaRpcShape,kit: import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {Extract<import("@solos/actions").Action, {type:"deposit_perp_collateral" | "withdraw_perp_collateral"}>} Action */

const TX_CONFIG = Object.freeze({
  computeUnitLimit: 500_000,
  loadedAccountsDataSizeLimit: 67_108_864,
  priorityFeeLamports: 1000n,
});

/** @typedef {Effect.Effect.Success<ReturnType<typeof readCollateralTrader>>} TraderRead */
/** @typedef {Effect.Effect.Success<ReturnType<typeof readCollateralExchange>>} ExchangeRead */
/** @param {Deps} deps @param {{owner:string;state:TraderRead["state"];exchange:ExchangeRead;amount:bigint;isDeposit:boolean}} facts */
const checkAssets = (deps, { owner, state, exchange, amount, isDeposit }) =>
  Effect.gen(function* () {
    if (!isDeposit && !exchange.withdrawalsAvailable)
      return yield* new BuildRejected({ reason: "Phoenix withdrawals are disabled" });
    yield* requireCollateralMint(deps.ctx, exchange.usdcMint);
    yield* requireCollateralMint(deps.ctx, exchange.canonicalMint);
    const atas = yield* Effect.tryPromise({
      try: () => collateralAtas(owner, exchange.usdcMint, exchange.canonicalMint),
      catch: () =>
        new BuildRejected({ reason: "Phoenix wallet token accounts could not be derived" }),
    });
    const walletUsdc = yield* readCollateralTokenBalance(deps.ctx, {
      key: atas.usdc,
      owner,
      mint: exchange.usdcMint,
      required: isDeposit,
    });
    if (isDeposit && walletUsdc < amount)
      return yield* new BuildRejected({ reason: "insufficient wallet USDC for Phoenix deposit" });
    yield* readCollateralTokenBalance(deps.ctx, {
      key: atas.phoenix,
      owner,
      mint: exchange.canonicalMint,
      required: false,
    });
    if (!isDeposit) {
      const available = yield* assertWithdrawalReady({
        config: deps.config,
        ctx: deps.ctx,
        owner,
        trader: state,
      });
      if (available < amount)
        return yield* new BuildRejected({
          reason: "insufficient available Phoenix trader collateral",
        });
    }
    return { atas, walletUsdc };
  });

/** @param {Deps} deps @param {Action} action */
const prepare = (deps, action) =>
  Effect.gen(function* () {
    if (!ActionSchema.safeParse(action).success)
      return yield* new BuildRejected({ reason: "invalid Phoenix collateral input" });
    const isDeposit = action.type === "deposit_perp_collateral";
    const owner = deps.kit.signer.address;
    const amount = BigInt(action.amount);
    const { trader, state } = yield* readCollateralTrader(deps.ctx, owner);
    const exchange = yield* readCollateralExchange(deps.config, deps.ctx);
    const { atas, walletUsdc } = yield* checkAssets(deps, {
      owner,
      state,
      exchange,
      amount,
      isDeposit,
    });
    const { value: payerLamports } = yield* rpcCall("getBalance", deps.ctx.url, () =>
      deps.ctx.rpc.getBalance(owner, { commitment: "confirmed" }).send(),
    );
    return {
      owner,
      trader,
      state,
      exchange,
      atas,
      walletUsdc,
      payerLamports,
      amount,
      direction: /** @type {"deposit" | "withdraw"} */ (isDeposit ? "deposit" : "withdraw"),
    };
  });

/** @param {Deps} deps @param {Effect.Effect.Success<ReturnType<typeof prepare>>} facts */
const signPlan = (deps, facts) =>
  Effect.gen(function* () {
    const { owner, trader, exchange, atas, amount, direction } = facts;
    const parts = /** @type {import("@ellipsis-labs/rise").BuildWithdrawIxsResolvedInput} */ (
      /** @type {unknown} */ ({
        exchange,
        trader: {
          authority: owner,
          traderAccount: trader,
          usdcTokenAccount: atas.usdc,
          phoenixTokenAccount: atas.phoenix,
        },
        amount,
        feePayer: owner,
      })
    );
    const instructions = yield* Effect.try({
      try: () => collateralInstructions(direction, parts),
      catch: () =>
        new BuildRejected({ reason: "Phoenix collateral instructions failed validation" }),
    });
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", deps.ctx.url, () =>
      deps.ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    const message = appendTransactionMessageInstructions(
      instructions,
      setTransactionMessageLifetimeUsingBlockhash(
        lifetime,
        beginV1Message({ feePayerSigner: deps.kit.signer, config: TX_CONFIG }),
      ),
    );
    const signed = yield* Effect.tryPromise({
      try: () => signV1Message(message),
      catch: (/** @type {unknown} */ error) =>
        rejectionAfterV1Policy(error, "Phoenix collateral transfer"),
    });
    return { signed, facts };
  });

/** @param {Deps} deps @param {Action} action */
export const buildCollateral = (deps, action) =>
  Effect.flatMap(prepare(deps, action), (facts) => signPlan(deps, facts));
