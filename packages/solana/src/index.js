// @ts-check
/** @typedef {import("./env.js").SolanaEnv} SolanaEnv */
/** @typedef {import("./credentials/resolve.js").SignerSource} SignerSource */
/** @typedef {import("./credentials/profile.js").Profile} Profile */
/** @typedef {import("./credentials/profile.js").ProviderName} ProviderName */
/** @typedef {import("./credentials/discover.js").DiscoveredWallet} DiscoveredWallet */
import { SignerConfigMissing } from "@solos/core";
import { Layer } from "effect";
import { JevToolSelectorLive } from "./discovery/jev-tool-selector.js";
import { LocalToolSelectorLive } from "./discovery/local-tool-selector.js";
import {
  DEFAULT_AI_GATEWAY_BASE_URL,
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  DEFAULT_PHOENIX_BASE_URL,
} from "./env.js";
import { DirectSignerExecutor } from "./executor/direct-signer-executor.js";
import { EngineSolanaLive } from "./executor/engine-live.js";
import { LaunchVenueLive } from "./launch/launch-venue-live.js";
import { KAMINO_MAIN_MARKET } from "./lend/kamino-addresses.js";
import { KaminoVenueLive } from "./lend/kamino-venue-live.js";
import { LiquidityVenueLive } from "./liquidity/liquidity-venue-live.js";
import { JupiterPriceLive } from "./market/jupiter-price-live.js";
import { MarketIntelligenceLive } from "./market/market-intelligence-live.js";
import { TokenRegistryLive } from "./market/token-registry-live.js";
import { PerpOnboarderLive } from "./perp/perp-onboarder-live.js";
import { PerpVenueLive } from "./perp/perp-venue-live.js";
import { PortfolioReaderLive } from "./portfolio/portfolio-reader-live.js";
import { SolanaRpcLive } from "./rpc/solana-rpc.js";
import { KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
import { SignerLive } from "./signer/signer-live.js";
import { MissingCallerPorts } from "./strategy/missing-registry.js";
import { RpcSubmitterLive } from "./submission/submitter.js";
import { JupiterSwapBuildLive } from "./swap/jupiter-swap-build-live.js";
import { JupiterSwapLive } from "./swap/jupiter-swap-live.js";
import { BalanceReaderLive } from "./wallet/balance-reader-live.js";

export * from "./credentials/index.js";
export { JevToolSelectorLive } from "./discovery/jev-tool-selector.js";
export { LocalToolSelectorLive } from "./discovery/local-tool-selector.js";
export { diagnoseSolanaEnv } from "./doctor.js";
export {
  DEFAULT_AI_GATEWAY_BASE_URL,
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  DEFAULT_PHOENIX_BASE_URL,
  deriveWsUrl,
  elfaBaseUrl,
  isAllowedEndpoint,
  jupiterBaseUrl,
  loadGatewayEnv,
  loadSolanaEnv,
  phoenixBaseUrl,
} from "./env.js";
export { DirectSignerExecutor, EXECUTOR_NAME } from "./executor/direct-signer-executor.js";
export { EngineExecutor } from "./executor/engine-executor.js";
export { LaunchVenueLive } from "./launch/launch-venue-live.js";
export { KAMINO_MAIN_MARKET, KLEND_PROGRAM_ID } from "./lend/kamino-addresses.js";
export { KaminoVenueLive } from "./lend/kamino-venue-live.js";
export { LiquidityVenueLive } from "./liquidity/liquidity-venue-live.js";
export { JupiterPriceLive } from "./market/jupiter-price-live.js";
export { MarketIntelligenceLive } from "./market/market-intelligence-live.js";
export { TokenRegistryLive } from "./market/token-registry-live.js";
export { PerpOnboarderLive } from "./perp/perp-onboarder-live.js";
export { PerpVenueLive } from "./perp/perp-venue-live.js";
export { PortfolioReaderLive } from "./portfolio/portfolio-reader-live.js";
export * from "./privy/index.js";
export { rpcOrigin } from "./rpc/rpc-origin.js";
export { SolanaRpc, SolanaRpcLive } from "./rpc/solana-rpc.js";
export { KitSigner, KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
export { SignerLive } from "./signer/signer-live.js";
export { HttpCapLedger, HttpStrategyRegistry } from "./strategy/caller-http.js";
export { SLOW, SubmissionModeSchema } from "./submission/mode.js";
export { signatureOutlook } from "./submission/signature-outlook.js";
export { signedIntentNote } from "./submission/signed-note.js";
export { RpcSubmitterLive, Submitter } from "./submission/submitter.js";
export { JupiterSwapLive } from "./swap/jupiter-swap-live.js";
export { BalanceReaderLive } from "./wallet/balance-reader-live.js";

/**
 * Every core port this package implements over a KitSigner. `ActionExecutor` is the wallet
 * executor by default; an engine executor replaces this one Layer in vault mode (ADR-0013).
 * The executor starts with the default configured market; composition merges a market-aware
 * executor below, so the placeholder here provides the tag with no lend identity (the lend
 * branch defaults to the pinned Main Market when composition does not override it).
 * @param {{ readonly market?: string; readonly phoenix?: SolanaEnv["phoenix"] }} [executorConfig]
 */
const adapters = (executorConfig) =>
  Layer.mergeAll(
    SignerLive,
    BalanceReaderLive,
    TokenRegistryLive(),
    LaunchVenueLive(),
    KaminoVenueLive(),
    LiquidityVenueLive,
    DirectSignerExecutor(executorConfig),
    MissingCallerPorts,
  );

/**
 * Iris needs no chain access, so its Layer rides along unprovided: without ELFA_API_KEY the
 * tool stays advertised and fails with IrisConfigMissing only when actually asked.
 * @param {SolanaEnv["elfa"] | undefined} elfa
 */
const intelligence = (elfa) => MarketIntelligenceLive(elfa ?? { baseUrl: DEFAULT_ELFA_BASE_URL });

/**
 * Jupiter prices behave the same way: without JUPITER_API_KEY the tool stays advertised and
 * fails with PriceConfigMissing only when actually read.
 * @param {SolanaEnv["jupiter"] | undefined} jupiter
 */
const prices = (jupiter) => JupiterPriceLive(jupiter ?? { baseUrl: DEFAULT_JUPITER_BASE_URL });

/**
 * Jupiter swap quotes share the key and behave the same way: without JUPITER_API_KEY the tool
 * stays advertised and fails with QuoteConfigMissing only when actually read.
 * @param {SolanaEnv["jupiter"] | undefined} jupiter
 */
const quotes = (jupiter) => JupiterSwapLive(jupiter ?? { baseUrl: DEFAULT_JUPITER_BASE_URL });
/** Executor swap builds: no JUPITER_API_KEY → swap twins fail pre-HTTP with BuildUnavailable.
 * @param {SolanaEnv["jupiter"] | undefined} jupiter */
const builds = (jupiter) => JupiterSwapBuildLive(jupiter ?? { baseUrl: DEFAULT_JUPITER_BASE_URL });

/**
 * Phoenix Perps reads need no credential at all, so the layer is always constructible: the
 * tool stays advertised and only an individual read can fail with a transport error.
 * @param {SolanaEnv["phoenix"] | undefined} phoenix
 */
const perp = (phoenix) => {
  const config = phoenix ?? { baseUrl: DEFAULT_PHOENIX_BASE_URL };
  return Layer.merge(PerpVenueLive(config), PerpOnboarderLive(config));
};
/**
 * Free-text tool selection behaves like Iris and prices: without AI_GATEWAY_API_KEY it still
 * works, matching locally and saying so, because JEV fails pre-HTTP and selection falls back.
 * @param {SolanaEnv["gateway"] | undefined} gateway
 */
const selector = (gateway) =>
  JevToolSelectorLive(gateway ?? { baseUrl: DEFAULT_AI_GATEWAY_BASE_URL });

/**
 * Kamino lend reads need no credential either: the tool stays advertised and the one
 * configured market is the default Main Market unless `KAMINO_LENDING_MARKET` selects another.
 * @param {SolanaEnv["kamino"] | undefined} kamino
 */
const lending = (kamino) => KaminoVenueLive(kamino ?? { market: KAMINO_MAIN_MARKET });

/**
 * Feeds the composed read ports into the portfolio reader and merges its output back in.
 * The reader needs the venue tags as inputs, which the base layer already outputs.
 * @param {Layer.Layer<any, any, never>} base
 */
const withPortfolio = (base) => Layer.merge(base, PortfolioReaderLive().pipe(Layer.provide(base)));

/**
 * Production wiring from validated env: RPC + keychain signer + all adapters.
 * `provideMerge` keeps the internal tags visible for the CLI and tests.
 * `SOLOS_EXECUTOR=engine` swaps in the remote executor and does not build a local signer.
 * @param {SolanaEnv} env
 */
const directSolanaLive = (env) => {
  if (env.signer === undefined) {
    throw new SignerConfigMissing({
      reason:
        "no signer: set SOLOS_SIGNER_KEYPAIR_PATH / SOLOS_SIGNER_PRIVATE_KEY, or run `solos login`",
      remedy: "run `solos login` to save a profile, or export SOLOS_SIGNER_KEYPAIR_PATH",
    });
  }
  return withPortfolio(
    adapters({ market: env.kamino.market, phoenix: env.phoenix }).pipe(
      Layer.merge(lending(env.kamino)),
      Layer.provideMerge(KitSignerLive(env.signer)),
      Layer.provideMerge(RpcSubmitterLive),
      Layer.provideMerge(SolanaRpcLive(env.rpcUrl, env.wsUrl)),
      Layer.provideMerge(builds(env.jupiter)),
      Layer.merge(intelligence(env.elfa)),
      Layer.merge(prices(env.jupiter)),
      Layer.merge(quotes(env.jupiter)),
      Layer.merge(perp(env.phoenix)),
      Layer.merge(selector(env.gateway)),
    ),
  );
};

/** @param {SolanaEnv} env */
export const SolanaLive = (env) =>
  env.executor === "engine" ? EngineSolanaLive(env) : directSolanaLive(env);

/**
 * Test wiring: same adapters, signer from raw bytes, RPC by URL. `elfa`, `jupiter` and
 * `phoenix` stay optional so existing call sites are untouched; default configs fail pre-HTTP
 * on use.
 * @param {{
 *   rpcUrl: string;
 *   wsUrl: string;
 *   seed: Uint8Array;
 *   elfa?: SolanaEnv["elfa"];
 *   jupiter?: SolanaEnv["jupiter"];
 *   phoenix?: SolanaEnv["phoenix"];
 *   kamino?: SolanaEnv["kamino"];
 * }} options
 */
export const SolanaTestLive = ({ rpcUrl, wsUrl, seed, elfa, jupiter, phoenix, kamino }) => {
  const testPhoenix = phoenix ?? {
    baseUrl: "http://127.0.0.1",
    fetchImpl: async () => {
      throw new Error("Phoenix fixture required for SolanaTestLive");
    },
  };
  return withPortfolio(
    adapters({ market: kamino?.market, phoenix: testPhoenix }).pipe(
      Layer.merge(lending(kamino)),
      Layer.provideMerge(KitSignerFromBytes(seed)),
      Layer.provideMerge(RpcSubmitterLive),
      Layer.provideMerge(SolanaRpcLive(rpcUrl, wsUrl)),
      Layer.provideMerge(builds(jupiter)),
      Layer.merge(intelligence(elfa)),
      Layer.merge(prices(jupiter)),
      Layer.merge(quotes(jupiter)),
      Layer.merge(perp(testPhoenix)),
      // Reusable tests never reach JEV: the local matcher ranks free text.
      Layer.merge(LocalToolSelectorLive),
    ),
  );
};
