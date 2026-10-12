// @ts-check
import path from "node:path";
import { Signer } from "@solos/core";
import { loadSolanaEnv } from "@solos/solana";
import { Effect, Layer, ManagedRuntime } from "effect";
import { syncHolds } from "./cap-sync.js";
import { resolveAllowedMints, resolveStart } from "./config.js";
import { compiledStrategyMount, engineHostLayer } from "./host.js";
import { openIntents } from "./intents.js";
import { bootPaper } from "./paper.js";
import { recoverIntents } from "./recover.js";
import { installRedaction } from "./redact.js";
import { serveEngine } from "./serve.js";
import { bootTicks } from "./tick-boot.js";

/**
 * @typedef {Parameters<typeof resolveStart>[0] & {
 *   strategies?: boolean;
 *   allowedMints?: ReadonlyArray<string>;
 *   tickDrive?: "manual" | "auto";
 *   now?: () => number;
 *   observations?: () => Readonly<Record<string, string | number>>;
 *   quote?: import("./strategy-layer.js").StrategyLayerOptions["quote"];
 * }} StartInput
 */

/**
 * Start the engine in this process. Paper boots Surfpool first and funds the signer before the
 * socket opens, so the first request already has lamports. The returned `stop` closes the
 * socket, the database, the runtime and, in paper mode, Surfpool.
 * `strategies: true` mounts the registry for in-process tests. A release process mounts it too.
 * @param {StartInput} input
 */
export const startEngine = async (input) => {
  const start = resolveStart(input);
  const paper = start.paper ? await bootPaper() : undefined;
  const restore = installRedaction({
    token: start.token,
    rpcUrl: paper?.rpcUrl ?? input.env.SOLANA_RPC_URL ?? "",
  });
  try {
    const served = await listen(
      input.env,
      { ...start, ...strategyStart(input, start.mode) },
      paper,
    );
    return {
      url: served.url,
      signer: served.signer,
      tier: start.tier,
      mode: start.mode,
      runDue: served.runDue,
      stop: () => shutdown(served, paper, restore),
    };
  } catch (error) {
    restore();
    if (paper !== undefined) await paper.stop();
    throw error;
  }
};

/**
 * The resolved start plus the strategy clock. `allowedMints` is resolved here so a live
 * Engine still refuses to start without an allowlist.
 * @param {StartInput} input
 * @param {ReturnType<typeof resolveStart>["mode"]} mode
 */
const strategyStart = (input, mode) => ({
  strategies: input.strategies,
  allowedMints: resolveAllowedMints({ mode, allowedMints: input.allowedMints }),
  tickDrive: input.tickDrive ?? "manual",
  ...(input.now !== undefined && { now: input.now }),
  ...(input.observations !== undefined && { observations: input.observations }),
  ...(input.quote !== undefined && { quote: input.quote }),
});

/**
 * @typedef {ReturnType<typeof resolveStart> & {
 *   strategies?: boolean;
 *   allowedMints?: ReadonlyArray<string>;
 *   tickDrive?: "manual" | "auto";
 *   now?: () => number;
 *   observations?: () => Readonly<Record<string, string | number>>;
 *   quote?: import("./strategy-layer.js").StrategyLayerOptions["quote"];
 * }} StrategyStart
 */

/**
 * @param {Record<string, string | undefined>} env
 * @param {StrategyStart} start
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 */
const listen = async (env, start, paper) => {
  const solanaEnv = loadSolanaEnv(hostEnv(env, paper));
  const db = openIntents(path.join(start.dataDir, "intents.sqlite"));
  const mount = await strategyMount(db, start);
  const runtime = ManagedRuntime.make(runtimeLayer(solanaEnv, env, mount));
  /** @type {{ runDue: () => Promise<unknown>; stop: () => Promise<void> }} */
  let ticks = { runDue: async () => undefined, stop: async () => undefined };
  try {
    const signer = await runtime.runPromise(Effect.flatMap(Signer, addressOf));
    if (paper !== undefined) await paper.fund(signer);
    await recoverIntents({ db, runtime });
    await syncHolds({ db, runtime, caps: mount !== undefined });
    ticks = await bootTicks(runtime, mount !== undefined, start);
    const served = await serveEngine({
      runtime,
      db,
      signer,
      rpcUrl: solanaEnv.rpcUrl,
      host: start.host,
      port: start.port,
      tier: start.tier,
      mode: start.mode,
      token: start.token,
      dataDir: start.dataDir,
      ...(mount !== undefined && { strategyHandle: mount.handle }),
    });
    return { ...served, runDue: ticks.runDue, stopTicks: ticks.stop };
  } catch (error) {
    await ticks.stop();
    db.close();
    await runtime.dispose();
    throw error;
  }
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {StrategyStart} input
 */
const strategyMount = async (db, input) => {
  const options = layerOptions(input);
  if (input.strategies === true) return explicitMount(db, options);
  if (input.strategies === false) return undefined;
  return compiledStrategyMount(db, options);
};

/**
 * @param {StrategyStart} input
 */
const layerOptions = (input) => ({
  allowedMints: input.allowedMints ?? [],
  minIntervalMs: input.minIntervalMs,
  tickWindow: input.tickWindow,
  dry: input.mode === "dry",
  now: input.now ?? (() => Date.now()),
  ...(input.observations !== undefined && { observations: input.observations }),
  ...(input.quote !== undefined && { quote: input.quote }),
});

/**
 * In-process tests mount the same modules a release build serves.
 * @param {import("bun:sqlite").Database} db
 * @param {import("./strategy-layer.js").StrategyLayerOptions} options
 */
const explicitMount = async (db, options) => {
  const [{ strategyLayer }, { handleStrategy }] = await Promise.all([
    import("./strategy-layer.js"),
    import("./strategy-http.js"),
  ]);
  return { layer: strategyLayer(db, options), handle: handleStrategy };
};

/**
 * @param {import("@solos/solana").SolanaEnv} solanaEnv
 * @param {Record<string, string | undefined>} env
 * @param {Awaited<ReturnType<typeof strategyMount>>} mount
 */
const runtimeLayer = (solanaEnv, env, mount) => {
  const host = engineHostLayer(solanaEnv, env.SOLOS_LOG_LEVEL, env.OTEL_EXPORTER_OTLP_ENDPOINT);
  if (mount === undefined) return host;
  return mount.layer.pipe(Layer.provideMerge(host));
};

/** @param {import("@solos/core/wallet").SignerShape} service */
const addressOf = (service) => service.address();

/**
 * The engine host always signs locally, even when the Operator's shell has
 * `SOLOS_EXECUTOR=engine` for the callers beside it.
 * @param {Record<string, string | undefined>} env
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 */
const hostEnv = (env, paper) => ({
  ...env,
  SOLOS_EXECUTOR: /** @type {const} */ ("direct"),
  ...(paper !== undefined && { SOLANA_RPC_URL: paper.rpcUrl, SOLANA_WS_URL: paper.wsUrl }),
});

/**
 * @param {{ stop: () => Promise<void>; stopTicks: () => Promise<void> }} served
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 * @param {() => void} restore
 */
const shutdown = async (served, paper, restore) => {
  await served.stopTicks();
  await served.stop();
  if (paper !== undefined) await paper.stop();
  restore();
};
