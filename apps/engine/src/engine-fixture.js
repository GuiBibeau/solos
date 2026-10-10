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
import { ENGINE_TOKEN, forwardStart, hostEnv, stopEngine } from "./engine-test-env.js";
import { startEngine } from "./start.js";

export { ENGINE_TOKEN };

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
 * `dataDir` reopens an existing store. `keepData` leaves that directory after stop.
 * `rpcUrl` replaces the fork URL the engine dials (a proxy in front of Surfpool).
 * @param {import("./engine-test-env.js").TestEngineOptions} [options]
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
 * @param {import("./engine-test-env.js").TestEngineOptions} options
 * @param {() => void} release
 */
const boot = async (options, release) => {
  const surfnet = await ensureSurfnet();
  const identity = await freshSigner();
  const directory = dataDirectory(options);
  await surfnet.cheats.fundSol(identity.signer, 2);
  /** @type {string[]} */
  const logs = [];
  const restore = captureStderr(logs);
  const handle = await launch({ options, identity, directory, surfnet, restore });
  return presented(handle, { identity, directory, surfnet, logs, restore, release, options });
};

const freshSigner = async () => {
  const seed = randomSeed();
  return { privateKey: await seedToPrivateKeyString(seed), signer: await seedAddress(seed) };
};

/** @param {{ dataDir?: string }} options */
const dataDirectory = (options) => ({
  path: options.dataDir ?? mkdtempSync(path.join(tmpdir(), "solos-engine-")),
  created: options.dataDir === undefined,
});

/**
 * @typedef {{
 *   options: import("./engine-test-env.js").TestEngineOptions;
 *   identity: { privateKey: string; signer: string };
 *   directory: { path: string; created: boolean };
 *   surfnet: Awaited<ReturnType<typeof ensureSurfnet>>;
 *   restore: () => void;
 * }} LaunchInput
 * @typedef {{ identity: { privateKey: string; signer: string }; directory: { path: string }; surfnet: Awaited<ReturnType<typeof ensureSurfnet>>; logs: string[]; restore: () => void; release: () => void; options: { keepData?: boolean } }} PresentedParts
 */

/** @param {LaunchInput} input */
const launch = (input) =>
  startEngine({
    env: hostEnv({
      privateKey: input.identity.privateKey,
      dataDir: input.directory.path,
      rpcUrl: input.options.rpcUrl ?? input.surfnet.rpcUrl,
      wsUrl: input.options.wsUrl ?? input.surfnet.wsUrl,
      extra: input.options.env,
    }),
    tier: input.options.tier,
    host: "127.0.0.1",
    port: freePort(),
    dataDir: input.directory.path,
    ...forwardStart(input.options),
  }).catch((error) => {
    input.restore();
    if (input.directory.created) rmSync(input.directory.path, { recursive: true, force: true });
    throw error;
  });

/**
 * @param {{ url: string; signer: string; stop: () => Promise<void> }} handle
 * @param {PresentedParts} parts
 */
const presented = (handle, parts) => ({
  ...handle,
  token: ENGINE_TOKEN,
  privateKey: parts.identity.privateKey,
  signer: parts.identity.signer,
  dataDir: parts.directory.path,
  surfnet: parts.surfnet,
  logs: () => parts.logs.join(""),
  stop: () =>
    stopEngine({
      handle,
      restore: parts.restore,
      dataDir: parts.directory.path,
      release: parts.release,
      removeDir: parts.options.keepData !== true,
    }),
});

