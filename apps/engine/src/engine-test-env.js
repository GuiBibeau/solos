// @ts-check
import { rmSync } from "node:fs";

export const ENGINE_TOKEN = "engine-integration-token";

/**
 * @typedef {{
 *   tier?: "read" | "simulate" | "execute";
 *   dataDir?: string;
 *   keepData?: boolean;
 *   rpcUrl?: string;
 *   wsUrl?: string;
 *   strategies?: boolean;
 *   allowedMints?: ReadonlyArray<string>;
 *   env?: Record<string, string>;
 *   now?: () => number;
 *   tickDrive?: "manual" | "auto";
 *   minIntervalMs?: number;
 *   tickWindow?: number;
 *   observations?: () => Readonly<Record<string, string | number>>;
 *   quote?: import("./strategy-layer.js").StrategyLayerOptions["quote"];
 * }} TestEngineOptions
 */

/** @param {TestEngineOptions} options */
export const forwardStart = (options) => ({
  ...whenSet("strategies", options.strategies),
  ...whenSet("allowedMints", options.allowedMints),
  ...whenSet("now", options.now),
  ...whenSet("tickDrive", options.tickDrive),
  ...whenSet("minIntervalMs", options.minIntervalMs),
  ...whenSet("tickWindow", options.tickWindow),
  ...whenSet("observations", options.observations),
  ...whenSet("quote", options.quote),
});

/** @param {string} key @param {unknown} value */
const whenSet = (key, value) => (value === undefined ? {} : { [key]: value });

/**
 * @param {{ privateKey: string; dataDir: string; rpcUrl: string; wsUrl: string; extra?: Record<string, string> }} input
 */
export const hostEnv = (input) => ({
  ...input.extra,
  SOLOS_ENGINE_TOKEN: ENGINE_TOKEN,
  SOLOS_SIGNER_PRIVATE_KEY: input.privateKey,
  SOLOS_CONFIG_DIR: input.dataDir,
  SOLOS_LOG_LEVEL: "info",
  SOLANA_RPC_URL: input.rpcUrl,
  SOLANA_WS_URL: input.wsUrl,
});

/** @param {{ handle: { stop: () => Promise<void> }; restore: () => void; dataDir: string; release: () => void; removeDir: boolean }} input */
export const stopEngine = async (input) => {
  try {
    await input.handle.stop();
    input.restore();
    if (input.removeDir) rmSync(input.dataDir, { recursive: true, force: true });
  } finally {
    input.release();
  }
};
