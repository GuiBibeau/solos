// @ts-check
import { EngineConfigMissing } from "@solos/core";
import { Layer } from "effect";
import { JevToolSelectorLive } from "../discovery/jev-tool-selector.js";
import { LaunchVenueLive } from "../launch/launch-venue-live.js";
import { KaminoVenueLive } from "../lend/kamino-venue-live.js";
import { LiquidityVenueLive } from "../liquidity/liquidity-venue-live.js";
import { JupiterPriceLive } from "../market/jupiter-price-live.js";
import { MarketIntelligenceLive } from "../market/market-intelligence-live.js";
import { TokenRegistryLive } from "../market/token-registry-live.js";
import { PerpOnboarderLive } from "../perp/perp-onboarder-live.js";
import { PerpVenueLive } from "../perp/perp-venue-live.js";
import { PortfolioReaderLive } from "../portfolio/portfolio-reader-live.js";
import { SolanaRpcLive } from "../rpc/solana-rpc.js";
import { JupiterSwapBuildLive } from "../swap/jupiter-swap-build-live.js";
import { JupiterSwapLive } from "../swap/jupiter-swap-live.js";
import { BalanceReaderLive } from "../wallet/balance-reader-live.js";
import { EngineExecutor } from "./engine-executor.js";
import { EngineSigner } from "./engine-signer.js";

/** @typedef {import("../env.js").SolanaEnv} SolanaEnv */

/** @param {Layer.Layer<any, any, never>} base */
const withPortfolio = (base) => Layer.merge(base, PortfolioReaderLive().pipe(Layer.provide(base)));

/**
 * Reads stay local. The signer address and every simulate or execute call go to the engine,
 * so this layer never builds a Kit signer.
 * @param {SolanaEnv} env
 */
const readStack = (env) => {
  const engine = env.engine;
  if (engine === undefined) {
    throw new EngineConfigMissing({
      reason: "SOLOS_ENGINE_URL is not set",
      remedy: "export SOLOS_ENGINE_URL",
    });
  }
  return Layer.mergeAll(
    EngineSigner(engine),
    BalanceReaderLive,
    TokenRegistryLive(),
    LaunchVenueLive(),
    KaminoVenueLive(),
    LiquidityVenueLive,
    EngineExecutor(engine),
  ).pipe(
    Layer.merge(KaminoVenueLive(env.kamino)),
    Layer.provideMerge(SolanaRpcLive(env.rpcUrl, env.wsUrl)),
    Layer.provideMerge(JupiterSwapBuildLive(env.jupiter)),
    Layer.merge(MarketIntelligenceLive(env.elfa)),
    Layer.merge(JupiterPriceLive(env.jupiter)),
    Layer.merge(JupiterSwapLive(env.jupiter)),
    Layer.merge(Layer.merge(PerpVenueLive(env.phoenix), PerpOnboarderLive(env.phoenix))),
    Layer.merge(JevToolSelectorLive(env.gateway)),
  );
};

/**
 * Production wiring for `SOLOS_EXECUTOR=engine`. Same read adapters as `SolanaLive`, with
 * `EngineExecutor` in place of the local signer.
 * @param {SolanaEnv} env
 */
export const EngineSolanaLive = (env) => withPortfolio(readStack(env));
