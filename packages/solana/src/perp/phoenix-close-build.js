// @ts-check
import {
  appendTransactionMessageInstruction,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/kit";
import { ActionSchema } from "@solos/actions";
import { BuildRejected, NoPositionToClose } from "@solos/core";
import { Effect } from "effect";
import { beginV1Message, signV1Message } from "../executor/transaction-v1.js";
import { rpcCall } from "../rpc/rpc-call.js";
import { buildCloseInstruction } from "./phoenix-close-instructions.js";
import { planCloseLots } from "./phoenix-close-math.js";
import { readCloseRisk } from "./phoenix-close-risk.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { readCollateralExchange } from "./phoenix-collateral-exchange-live.js";
import { readOpenMarket } from "./phoenix-open-market.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {Extract<import("@solos/actions").Action,{type:"close_perp"}>} CloseAction */
const TX_CONFIG = Object.freeze({
  computeUnitLimit: 500_000,
  loadedAccountsDataSizeLimit: 67_108_864,
  priorityFeeLamports: 1000n,
});

/** @param {Deps} deps @param {CloseAction} action */
const readFacts = (deps, action) =>
  Effect.gen(function* () {
    if (!ActionSchema.safeParse(action).success)
      return yield* new BuildRejected({ reason: "Phoenix close action is not a bounded intent" });
    const startedAt = Date.now();
    const owner = deps.kit.signer.address;
    const { trader, state } = yield* readCollateralTrader(deps.ctx, owner);
    const exchange = yield* readCollateralExchange(deps.config, deps.ctx);
    const symbol = action.market.replace(/-PERP$/, "");
    const market = yield* readOpenMarket({
      config: deps.config,
      ctx: deps.ctx,
      symbol,
      mapKey: exchange.perpAssetMap,
    });
    const risk = yield* readCloseRisk({
      config: deps.config,
      ctx: deps.ctx,
      owner,
      trader: state,
      symbol,
      assetId: market.assetId,
    });
    if (Date.now() - startedAt > 5000)
      return yield* new BuildRejected({
        reason: "Phoenix close market/account read expired before build",
      });
    return { owner, trader, state, exchange, market, symbol, risk, startedAt };
  });

/** @param {CloseAction} action @param {Effect.Effect.Success<ReturnType<typeof readFacts>>} facts */
const boundOrder = (action, facts) =>
  Effect.try({
    try: () =>
      planCloseLots({
        positionLots: facts.risk.positionLots,
        market: facts.market,
        limitPriceUsd: action.limitPriceUsd,
        observedSlot: facts.risk.slot,
        symbol: facts.symbol,
      }),
    catch: (error) =>
      error instanceof NoPositionToClose || error instanceof BuildRejected
        ? error
        : new BuildRejected({ reason: "Phoenix reduce-only close lots cannot be bounded" }),
  });

/** @param {Deps} deps @param {Effect.Effect.Success<ReturnType<typeof readFacts>> & {order:ReturnType<typeof planCloseLots>}} facts */
const signPlan = (deps, facts) =>
  Effect.gen(function* () {
    const instruction = yield* Effect.try({
      try: () => buildCloseInstruction(facts),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix reduce-only IOC instruction could not be built" }),
    });
    const { value: lifetime } = yield* rpcCall("getLatestBlockhash", deps.ctx.url, () =>
      deps.ctx.rpc.getLatestBlockhash({ commitment: "confirmed" }).send(),
    );
    if (Date.now() - facts.startedAt > 5000)
      return yield* new BuildRejected({ reason: "Phoenix close state expired while signing" });
    const message = appendTransactionMessageInstruction(
      instruction,
      setTransactionMessageLifetimeUsingBlockhash(
        lifetime,
        beginV1Message({ feePayerSigner: deps.kit.signer, config: TX_CONFIG }),
      ),
    );
    const signed = yield* Effect.tryPromise({
      try: () => signV1Message(message),
      catch: () =>
        new BuildRejected({ reason: "Phoenix reduce-only v1 signing failed before submission" }),
    });
    return { signed, facts };
  });

/** @param {Deps} deps @param {CloseAction} action */
export const buildClose = (deps, action) =>
  Effect.flatMap(readFacts(deps, action), (facts) =>
    Effect.flatMap(boundOrder(action, facts), (order) => signPlan(deps, { ...facts, order })),
  );
