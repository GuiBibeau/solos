// @ts-check
import { BuildRejected } from "@solos/core";
import { ActionSchema } from "@solos-sh/actions";
import { Effect } from "effect";
import { readOnboardingStatus } from "./perp-onboarder-live.js";
import { readCollateralTrader } from "./phoenix-collateral-accounts.js";
import { readCollateralExchange } from "./phoenix-collateral-exchange-live.js";
import { buildOpenInstruction } from "./phoenix-open-instructions.js";
import { readOpenMarket } from "./phoenix-open-market.js";
import { planOpenLots, protocolLeverageForLots } from "./phoenix-open-math.js";
import { readOpenRisk } from "./phoenix-open-risk.js";

/** @typedef {{config:import("./phoenix-api.js").PhoenixConfig;ctx:import("../rpc/solana-rpc.js").SolanaRpcShape;kit:import("../signer/kit-signer.js").KitSignerShape}} Deps */
/** @typedef {Extract<import("@solos-sh/actions").Action,{type:"open_perp"}>} OpenAction */

const TX_CONFIG = Object.freeze({
  computeUnitLimit: 500_000,
  loadedAccountsDataSizeLimit: 67_108_864,
  priorityFeeLamports: 1000n,
});

/** @param {Deps} deps */
const assertEnrolled = (deps) =>
  Effect.gen(function* () {
    const owner = deps.kit.signer.address;
    const status = yield* readOnboardingStatus(deps.config, owner).pipe(
      Effect.mapError(
        () => new BuildRejected({ reason: "Phoenix open permissions could not be verified" }),
      ),
    );
    if (status.state !== "ready")
      return yield* new BuildRejected({
        reason: "Enroll and activate the current Phoenix trader before opening",
      });
    return owner;
  });

/** @param {Deps} deps @param {OpenAction} action */
const readFacts = (deps, action) =>
  Effect.gen(function* () {
    if (!ActionSchema.safeParse(action).success)
      return yield* new BuildRejected({ reason: "Phoenix open action is not a bounded intent" });
    const owner = yield* assertEnrolled(deps);
    const startedAt = Date.now();
    const { trader, state } = yield* readCollateralTrader(deps.ctx, owner);
    const exchange = yield* readCollateralExchange(deps.config, deps.ctx);
    const market = yield* readOpenMarket({
      config: deps.config,
      ctx: deps.ctx,
      symbol: action.market.replace(/-PERP$/, ""),
      mapKey: exchange.perpAssetMap,
    });
    const risk = yield* readOpenRisk({ config: deps.config, ctx: deps.ctx, owner, trader: state });
    if (Date.now() - startedAt > 5000)
      return yield* new BuildRejected({
        reason: "Phoenix open market/account read expired before build",
      });
    return { owner, trader, state, exchange, market, risk, startedAt };
  });

/** @param {OpenAction} action @param {Effect.Effect.Success<ReturnType<typeof readFacts>>} facts */
const boundOrder = (action, facts) =>
  Effect.try({
    try: () => {
      const { market, risk } = facts;
      const basis = {
        input: action,
        equity: risk.collateral,
        exposure: 0n,
        observedSlot: risk.slot,
      };
      const first = planOpenLots({
        ...basis,
        market: { ...market, protocolMaxLeverage: market.leverageTiers[0]?.maxLeverage ?? 0n },
      });
      return planOpenLots({
        ...basis,
        market: {
          ...market,
          protocolMaxLeverage: protocolLeverageForLots(market.leverageTiers, first.numBaseLots),
        },
      });
    },
    catch: (error) =>
      error instanceof BuildRejected
        ? error
        : new BuildRejected({ reason: "Phoenix IOC size or leverage is unsafe" }),
  });

/** @param {Deps} deps @param {OpenAction} action */
const readPlan = (deps, action) =>
  Effect.flatMap(readFacts(deps, action), (facts) =>
    Effect.map(boundOrder(action, facts), (order) => ({
      ...facts,
      order: { ...order, side: action.side },
      observedSlot: facts.risk.slot,
    })),
  );

/**
 * The open's draft. The 5 s build window is checked last, right before Submission seals the
 * draft (ADR-0032); the guard checks it again before sending.
 * @param {Effect.Effect.Success<ReturnType<typeof readPlan>>} facts
 */
const draftPlan = (facts) =>
  Effect.gen(function* () {
    const instruction = yield* Effect.try({
      try: () => buildOpenInstruction(facts),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix IOC instruction could not be built" }),
    });
    if (Date.now() - facts.startedAt > 5000)
      return yield* new BuildRejected({ reason: "Phoenix open state expired before signing" });
    /** @type {import("../submission/seal-draft.js").Draft} */
    const draft = { label: "Phoenix IOC open", instructions: [instruction], config: TX_CONFIG };
    return { draft, facts };
  });

/** @param {Deps} deps @param {OpenAction} action */
export const buildOpen = (deps, action) =>
  Effect.flatMap(readPlan(deps, action), (facts) => draftPlan(facts));
