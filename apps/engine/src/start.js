// @ts-check
import path from "node:path";
import { Signer } from "@solos/core";
import { loadSolanaEnv } from "@solos/solana";
import { Effect, Layer, ManagedRuntime } from "effect";
import { syncHolds } from "./cap-sync.js";
import { resolveStart } from "./config.js";
import { compiledStrategyMount, engineHostLayer } from "./host.js";
import { openIntents } from "./intents.js";
import { bootPaper } from "./paper.js";
import { recoverIntents } from "./recover.js";
import { installRedaction } from "./redact.js";
import { serveEngine } from "./serve.js";

/**
 * @typedef {Parameters<typeof resolveStart>[0] & {
 *   strategies?: boolean;
 *   allowedMints?: ReadonlyArray<string>;
 * }} StartInput
 */

/**
 * Start the engine in this process. Paper boots Surfpool first and funds the signer before the
 * socket opens, so the first request already has lamports. The returned `stop` closes the
 * socket, the database, the runtime and, in paper mode, Surfpool.
 * `strategies: true` mounts the registry for in-process tests. A release process mounts it
 * only when the STRATEGIES compile flag is on.
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
    const served = await listen(input.env, { ...start, ...strategyStart(input) }, paper);
    return {
      url: served.url,
      signer: served.signer,
      tier: start.tier,
      mode: start.mode,
      stop: () => shutdown(served, paper, restore),
    };
  } catch (error) {
    restore();
    if (paper !== undefined) await paper.stop();
    throw error;
  }
};

/** @param {StartInput} input */
const strategyStart = (input) => ({
  strategies: input.strategies,
  allowedMints: input.allowedMints,
});

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof resolveStart> & Pick<StartInput, "strategies" | "allowedMints">} start
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 */
const listen = async (env, start, paper) => {
  const solanaEnv = loadSolanaEnv(hostEnv(env, paper));
  const db = openIntents(path.join(start.dataDir, "intents.sqlite"));
  const mount = await strategyMount(db, start);
  const runtime = ManagedRuntime.make(runtimeLayer(solanaEnv, env, mount));
  try {
    const signer = await runtime.runPromise(Effect.flatMap(Signer, addressOf));
    if (paper !== undefined) await paper.fund(signer);
    await recoverIntents({ db, runtime });
    await syncHolds({ db, runtime, caps: mount !== undefined });
    return await serveEngine({
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
  } catch (error) {
    db.close();
    await runtime.dispose();
    throw error;
  }
};

/**
 * @param {import("bun:sqlite").Database} db
 * @param {Pick<StartInput, "strategies" | "allowedMints">} input
 */
const strategyMount = async (db, input) => {
  const allowedMints = input.allowedMints ?? [];
  if (input.strategies === true) return explicitMount(db, allowedMints);
  if (input.strategies === false) return undefined;
  return compiledStrategyMount(db, allowedMints);
};

/**
 * In-process tests mount the same modules a STRATEGIES build serves.
 * @param {import("bun:sqlite").Database} db
 * @param {ReadonlyArray<string>} allowedMints
 */
const explicitMount = async (db, allowedMints) => {
  const [{ strategyLayer }, { handleStrategy }] = await Promise.all([
    import("./strategy-layer.js"),
    import("./strategy-http.js"),
  ]);
  return { layer: strategyLayer(db, allowedMints), handle: handleStrategy };
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
 * @param {{ stop: () => Promise<void> }} served
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 * @param {() => void} restore
 */
const shutdown = async (served, paper, restore) => {
  await served.stop();
  if (paper !== undefined) await paper.stop();
  restore();
};
