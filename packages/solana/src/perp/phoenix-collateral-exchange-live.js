// @ts-check
import {
  decodeGlobalConfiguration,
  getArenaAddresses,
  getEmberStateAddress,
  getEmberVaultAddress,
  getPhoenixGlobalVaultAddress,
  PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
  PHOENIX_LOG_AUTHORITY_ADDRESS,
  PHOENIX_PROGRAM_ADDRESS,
  USDC_MINT_ADDRESS,
} from "@ellipsis-labs/rise";
import { BuildRejected, BuildUnavailable } from "@solos/core";
import { Effect } from "effect";
import { rpcCall } from "../rpc/rpc-call.js";
import { readCollateralAccount } from "./phoenix-collateral-accounts.js";
import { validatedExchange } from "./phoenix-collateral-exchange.js";
import { phoenixOnboardGet } from "./phoenix-onboard-api.js";

/** @typedef {import("../rpc/solana-rpc.js").SolanaRpcShape} Rpc */
/** @typedef {import("./phoenix-api.js").PhoenixConfig} Config */
/** @typedef {ReturnType<typeof validatedExchange>} Exchange */

/** @param {Exchange} exchange @param {import("@ellipsis-labs/rise").GlobalConfiguration} config */
const assertGlobalConfig = (exchange, config) => {
  const links = [
    [config.accountKey, PHOENIX_GLOBAL_CONFIGURATION_ADDRESS],
    [config.canonicalTokenMintKey, exchange.canonicalMint],
    [config.globalVaultKey, exchange.globalVault],
    [config.perpAssetMapKey, exchange.perpAssetMap],
    [config.withdrawQueueKey, exchange.withdrawQueue],
    [config.globalTraderIndexHeaderKey, exchange.globalTraderIndex[0]],
    [config.activeTraderBufferHeaderKey, exchange.activeTraderBuffer[0]],
  ];
  if (config.quoteDecimals !== 6 || links.some(([actual, expected]) => actual !== expected))
    throw new BuildRejected({
      reason: "Phoenix collateral exchange keys do not match on-chain configuration",
    });
};

/** @param {readonly string[]} keys @param {string} seed */
const assertArena = async (keys, seed) => {
  const indices = Array.from({ length: keys.length - 1 }, (_, n) => n + 1);
  const expected = await getArenaAddresses(indices, seed, PHOENIX_PROGRAM_ADDRESS);
  if (new Set(keys).size !== keys.length || expected.some((key, i) => key !== keys[i + 1]))
    throw new BuildRejected({ reason: "Phoenix collateral arena accounts are redirected" });
};

/** @param {Exchange} exchange */
const verifyDerived = async (exchange) => {
  const mint = /** @type {import("@ellipsis-labs/rise").MintAddress} */ (
    /** @type {unknown} */ (exchange.canonicalMint)
  );
  const [vault, emberState, emberVault] = await Promise.all([
    getPhoenixGlobalVaultAddress(mint, PHOENIX_PROGRAM_ADDRESS),
    getEmberStateAddress(PHOENIX_PROGRAM_ADDRESS),
    getEmberVaultAddress(PHOENIX_PROGRAM_ADDRESS),
  ]);
  if (vault !== exchange.globalVault)
    throw new BuildRejected({ reason: "Phoenix collateral global vault is redirected" });
  await Promise.all([
    assertArena(exchange.globalTraderIndex, "global_trader_index"),
    assertArena(exchange.activeTraderBuffer, "active_trader_buffer"),
  ]);
  return { emberState, emberVault };
};

/** Read the API's bounded exchange snapshot, then pin every supplied account to on-chain
 * configuration or a derivation. No unauthenticated API account list can redirect a signer.
 * @param {Config} config @param {Rpc} ctx */
const fetchExchange = (config, ctx) =>
  Effect.gen(function* () {
    const slot = yield* rpcCall("getSlot", ctx.url, () =>
      ctx.rpc.getSlot({ commitment: "confirmed" }).send(),
    );
    const outcome = yield* Effect.tryPromise({
      try: () => phoenixOnboardGet(config, "/v1/exchange/snapshot"),
      catch: () => new BuildUnavailable({ reason: "Phoenix exchange snapshot is unavailable" }),
    });
    if (outcome.status !== 200)
      return yield* new BuildUnavailable({
        reason: `Phoenix exchange snapshot HTTP ${outcome.status}`,
      });
    const exchange = yield* Effect.try({
      try: () => validatedExchange(outcome.body, slot),
      catch: (error) =>
        error instanceof BuildRejected
          ? error
          : new BuildRejected({ reason: "Phoenix exchange snapshot is untrusted or stale" }),
    });
    return exchange;
  });

/** @param {Rpc} ctx @param {Exchange} exchange */
const checkChain = (ctx, exchange) =>
  Effect.gen(function* () {
    const row = yield* readCollateralAccount(
      ctx,
      PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
      "global configuration",
    );
    if (row.owner !== PHOENIX_PROGRAM_ADDRESS)
      return yield* new BuildRejected({
        reason: "Phoenix global configuration has the wrong program owner",
      });
    const global = yield* Effect.try({
      try: () => decodeGlobalConfiguration(row.bytes),
      catch: () => new BuildRejected({ reason: "Phoenix global configuration cannot be decoded" }),
    });
    const derived = yield* Effect.tryPromise({
      try: async () => {
        assertGlobalConfig(exchange, global);
        return await verifyDerived(exchange);
      },
      catch: () =>
        new BuildRejected({ reason: "Phoenix collateral exchange addresses failed verification" }),
    });
    return {
      phoenixProgramAddress: PHOENIX_PROGRAM_ADDRESS,
      logAuthorityAddress: PHOENIX_LOG_AUTHORITY_ADDRESS,
      globalConfigurationAddress: PHOENIX_GLOBAL_CONFIGURATION_ADDRESS,
      canonicalMint: exchange.canonicalMint,
      usdcMint: USDC_MINT_ADDRESS,
      globalVault: exchange.globalVault,
      globalTraderIndex: exchange.globalTraderIndex,
      activeTraderBuffer: exchange.activeTraderBuffer,
      perpAssetMap: exchange.perpAssetMap,
      withdrawQueue: exchange.withdrawQueue,
      ...derived,
      withdrawalsAvailable: exchange.withdrawalsAvailable,
    };
  });

/** @param {Config} config @param {Rpc} ctx */
export const readCollateralExchange = (config, ctx) =>
  Effect.flatMap(fetchExchange(config, ctx), (exchange) => checkChain(ctx, exchange));
