// @ts-check
/** @typedef {import("./env.js").SolanaEnv} SolanaEnv */
/** @typedef {import("./credentials/resolve.js").SignerSource} SignerSource */
/** @typedef {import("./credentials/profile.js").Profile} Profile */
/** @typedef {import("./credentials/profile.js").ProviderName} ProviderName */
/** @typedef {import("./credentials/discover.js").DiscoveredWallet} DiscoveredWallet */
import { Layer } from "effect";
import { DEFAULT_ELFA_BASE_URL, DEFAULT_JUPITER_BASE_URL } from "./env.js";
import { DirectSignerExecutor } from "./executor/direct-signer-executor.js";
import { LaunchVenueLive } from "./launch/launch-venue-live.js";
import { JupiterPriceLive } from "./market/jupiter-price-live.js";
import { MarketIntelligenceLive } from "./market/market-intelligence-live.js";
import { TokenRegistryLive } from "./market/token-registry-live.js";
import { SolanaRpcLive } from "./rpc/solana-rpc.js";
import { KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
import { SignerLive } from "./signer/signer-live.js";
import { JupiterSwapLive } from "./swap/jupiter-swap-live.js";
import { BalanceReaderLive } from "./wallet/balance-reader-live.js";

export * from "./credentials/index.js";
export * from "./privy/index.js";
export {
  DEFAULT_ELFA_BASE_URL,
  DEFAULT_JUPITER_BASE_URL,
  deriveWsUrl,
  elfaBaseUrl,
  jupiterBaseUrl,
  loadSolanaEnv,
} from "./env.js";
export { rpcOrigin } from "./rpc/rpc-origin.js";
export { DirectSignerExecutor, EXECUTOR_NAME } from "./executor/direct-signer-executor.js";
export { LaunchVenueLive } from "./launch/launch-venue-live.js";
export { MarketIntelligenceLive } from "./market/market-intelligence-live.js";
export { JupiterPriceLive } from "./market/jupiter-price-live.js";
export { TokenRegistryLive } from "./market/token-registry-live.js";
export { JupiterSwapLive } from "./swap/jupiter-swap-live.js";
export { SolanaRpc, SolanaRpcLive } from "./rpc/solana-rpc.js";
export { KitSigner, KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
export { SignerLive } from "./signer/signer-live.js";
export { BalanceReaderLive } from "./wallet/balance-reader-live.js";

/**
 * Every core port this package implements over a KitSigner. `ActionExecutor` is the wallet
 * executor by default; an engine executor replaces this one Layer in vault mode (ADR-0013).
 */
const adapters = Layer.mergeAll(
  SignerLive,
  BalanceReaderLive,
  TokenRegistryLive(),
  LaunchVenueLive(),
  DirectSignerExecutor,
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

/**
 * Production wiring from validated env: RPC + keychain signer + all adapters.
 * `provideMerge` keeps the internal tags visible for the CLI and tests.
 * @param {SolanaEnv} env
 */
export const SolanaLive = (env) =>
  adapters.pipe(
    Layer.provideMerge(KitSignerLive(env.signer)),
    Layer.provideMerge(SolanaRpcLive(env.rpcUrl, env.wsUrl)),
    Layer.merge(intelligence(env.elfa)),
    Layer.merge(prices(env.jupiter)),
    Layer.merge(quotes(env.jupiter)),
  );

/**
 * Test wiring: same adapters, signer from raw bytes, RPC by URL. `elfa` and `jupiter` stay
 * optional so existing call sites are untouched; default configs fail pre-HTTP on use.
 * @param {{ rpcUrl: string; wsUrl: string; seed: Uint8Array; elfa?: SolanaEnv["elfa"]; jupiter?: SolanaEnv["jupiter"] }} options
 */
export const SolanaTestLive = ({ rpcUrl, wsUrl, seed, elfa, jupiter }) =>
  adapters.pipe(
    Layer.provideMerge(KitSignerFromBytes(seed)),
    Layer.provideMerge(SolanaRpcLive(rpcUrl, wsUrl)),
    Layer.merge(intelligence(elfa)),
    Layer.merge(prices(jupiter)),
    Layer.merge(quotes(jupiter)),
  );
