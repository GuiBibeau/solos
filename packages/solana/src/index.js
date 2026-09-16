// @ts-check
/** @typedef {import("./env.js").SolanaEnv} SolanaEnv */
/** @typedef {import("./credentials/resolve.js").SignerSource} SignerSource */
/** @typedef {import("./credentials/profile.js").Profile} Profile */
/** @typedef {import("./credentials/profile.js").ProviderName} ProviderName */
/** @typedef {import("./credentials/discover.js").DiscoveredWallet} DiscoveredWallet */
import { Layer } from "effect";
import { DirectSignerExecutor } from "./executor/direct-signer-executor.js";
import { SolanaRpcLive } from "./rpc/solana-rpc.js";
import { KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
import { SignerLive } from "./signer/signer-live.js";
import { BalanceReaderLive } from "./wallet/balance-reader-live.js";

export * from "./credentials/index.js";
export * from "./privy/index.js";
export { deriveWsUrl, loadSolanaEnv } from "./env.js";
export { DirectSignerExecutor, EXECUTOR_NAME } from "./executor/direct-signer-executor.js";
export { SolanaRpc, SolanaRpcLive } from "./rpc/solana-rpc.js";
export { KitSigner, KitSignerFromBytes, KitSignerLive } from "./signer/kit-signer.js";
export { SignerLive } from "./signer/signer-live.js";
export { BalanceReaderLive } from "./wallet/balance-reader-live.js";

/**
 * Every core port this package implements over a KitSigner. `ActionExecutor` is the wallet
 * executor by default; an engine executor replaces this one Layer in vault mode (ADR-0013).
 */
const adapters = Layer.mergeAll(SignerLive, BalanceReaderLive, DirectSignerExecutor);

/**
 * Production wiring from validated env: RPC + keychain signer + all adapters.
 * `provideMerge` keeps the internal tags visible for the CLI and tests.
 * @param {import("./env.js").SolanaEnv} env
 */
export const SolanaLive = (env) =>
  adapters.pipe(
    Layer.provideMerge(KitSignerLive(env.signer)),
    Layer.provideMerge(SolanaRpcLive(env.rpcUrl, env.wsUrl)),
  );

/**
 * Test wiring: same adapters, signer from raw bytes, RPC by URL.
 * @param {{ rpcUrl: string; wsUrl: string; seed: Uint8Array }} options
 */
export const SolanaTestLive = ({ rpcUrl, wsUrl, seed }) =>
  adapters.pipe(
    Layer.provideMerge(KitSignerFromBytes(seed)),
    Layer.provideMerge(SolanaRpcLive(rpcUrl, wsUrl)),
  );
