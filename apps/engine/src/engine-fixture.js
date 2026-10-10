// @ts-check
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ensureSurfnet,
  randomSeed,
  seedAddress,
  seedToPrivateKeyString,
} from "@solos/solana/surfnet";
import { startEngine } from "./start.js";

export const ENGINE_TOKEN = "engine-integration-token";

/** @type {Promise<void>} */
let turn = Promise.resolve();

/** Engines capture `process.stderr`, so only one runs at a time. */
const acquire = () => {
  const { promise, resolve } = Promise.withResolvers();
  const previous = turn;
  turn = promise;
  return previous.then(() => releaseOnce(resolve));
};

/** @param {() => void} grant */
const releaseOnce = (grant) => {
  let isDone = false;
  return () => {
    if (isDone) return;
    isDone = true;
    grant();
  };
};

/** @returns {number} */
export const freePort = () => {
  const listener = Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } });
  const { port } = listener;
  listener.stop(true);
  return port;
};

/**
 * @param {{ url: string; token: string }} engine
 * @param {string} pathname
 * @param {{ method?: string; token?: string | false; body?: unknown }} [init]
 */
export const engineFetch = async (engine, pathname, init = {}) => {
  /** @type {Record<string, string>} */
  const headers = {};
  if (init.token !== false) headers.authorization = `Bearer ${init.token ?? engine.token}`;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${engine.url}${pathname}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return { status: response.status, body: await response.json() };
};

/**
 * @param {string[]} logs
 */
const captureStderr = (logs) => {
  const original = process.stderr.write.bind(process.stderr);
  const wrapped = (
    /** @type {string | Uint8Array} */ chunk,
    /** @type {BufferEncoding | undefined} */ encoding,
    /** @type {((error?: Error | null) => void) | undefined} */ callback,
  ) => {
    logs.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
    return original(chunk, encoding, callback);
  };
  process.stderr.write = /** @type {typeof process.stderr.write} */ (
    /** @type {unknown} */ (wrapped)
  );
  return () => {
    process.stderr.write = original;
  };
};

/**
 * An engine on the shared Surfpool, with a funded signer that exists only in this process.
 * @param {{ tier?: "read" | "simulate" | "execute" }} [options]
 */
export const startTestEngine = async (options = {}) => {
  const release = await acquire();
  try {
    return await boot(options, release);
  } catch (error) {
    release();
    throw error;
  }
};

/**
 * @param {{ tier?: "read" | "simulate" | "execute" }} options
 * @param {() => void} release
 */
const boot = async (options, release) => {
  const surfnet = await ensureSurfnet();
  const seed = randomSeed();
  const privateKey = await seedToPrivateKeyString(seed);
  const signer = await seedAddress(seed);
  const dataDir = mkdtempSync(path.join(tmpdir(), "solos-engine-"));
  await surfnet.cheats.fundSol(signer, 2);
  /** @type {string[]} */
  const logs = [];
  const restore = captureStderr(logs);
  const handle = await startEngine({
    env: hostEnv(privateKey, dataDir, surfnet),
    tier: options.tier,
    host: "127.0.0.1",
    port: freePort(),
    dataDir,
  }).catch((error) => {
    restore();
    rmSync(dataDir, { recursive: true, force: true });
    throw error;
  });
  return {
    ...handle,
    token: ENGINE_TOKEN,
    privateKey,
    signer,
    dataDir,
    surfnet,
    logs: () => logs.join(""),
    stop: () => stopEngine({ handle, restore, dataDir, release }),
  };
};

/**
 * @param {string} privateKey
 * @param {string} dataDir
 * @param {{ rpcUrl: string; wsUrl: string }} surfnet
 */
const hostEnv = (privateKey, dataDir, surfnet) => ({
  SOLOS_ENGINE_TOKEN: ENGINE_TOKEN,
  SOLOS_SIGNER_PRIVATE_KEY: privateKey,
  SOLOS_CONFIG_DIR: dataDir,
  SOLOS_LOG_LEVEL: "info",
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
});

/**
 * @param {{
 *   handle: { stop: () => Promise<void> };
 *   restore: () => void;
 *   dataDir: string;
 *   release: () => void;
 * }} input
 */
const stopEngine = async (input) => {
  try {
    await input.handle.stop();
    input.restore();
    rmSync(input.dataDir, { recursive: true, force: true });
  } finally {
    input.release();
  }
};
