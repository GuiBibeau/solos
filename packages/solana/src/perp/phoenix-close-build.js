// @ts-check
import { ActionSchema } from "@solos/actions";
import { BuildRejected, NoPositionToClose } from "@solos/core";
import { Effect } from "effect";
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

/**
 * The close's draft. The 5 s build window is checked last, right before Submission seals the
 * draft (ADR-0032); the guard checks it again before sending.
 * @param {Effect.Effect.Success<ReturnType<typeof readFacts>> & {order:ReturnType<typeof planCloseLots>}} facts
 */
const draftPlan = (facts) =>
  Effect.gen(function* () {
    const instruction = yield* Effect.try({
      try: () => buildCloseInstruction(facts),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix reduce-only IOC instruction could not be built" }),
    });
    if (Date.now() - facts.startedAt > 5000)
      return yield* new BuildRejected({ reason: "Phoenix close state expired before signing" });
    /** @type {import("../submission/seal-draft.js").Draft} */
    const draft = {
      label: "Phoenix reduce-only close",
      instructions: [instruction],
      config: TX_CONFIG,
    };
    return { draft, facts };
  });

/** @param {Deps} deps @param {CloseAction} action */
export const buildClose = (deps, action) =>
  Effect.flatMap(readFacts(deps, action), (facts) =>
    Effect.flatMap(boundOrder(action, facts), (order) => draftPlan({ ...facts, order })),
  );
