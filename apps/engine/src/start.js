// @ts-check
import path from "node:path";
import { Signer } from "@solos/core";
import { loadSolanaEnv } from "@solos/solana";
import { Effect, ManagedRuntime } from "effect";
import { resolveStart } from "./config.js";
import { engineHostLayer } from "./host.js";
import { openIntents } from "./intents.js";
import { bootPaper } from "./paper.js";
import { installRedaction } from "./redact.js";
import { serveEngine } from "./serve.js";

/**
 * Start the engine in this process. Paper boots Surfpool first and funds the signer before the
 * socket opens, so the first request already has lamports. The returned `stop` closes the
 * socket, the database, the runtime and, in paper mode, Surfpool.
 * @param {Parameters<typeof resolveStart>[0]} input
 */
export const startEngine = async (input) => {
  const start = resolveStart(input);
  const paper = start.paper ? await bootPaper() : undefined;
  const restore = installRedaction({
    token: start.token,
    rpcUrl: paper?.rpcUrl ?? input.env.SOLANA_RPC_URL ?? "",
  });
  try {
    const served = await listen(input.env, start, paper);
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

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof resolveStart>} start
 * @param {Awaited<ReturnType<typeof bootPaper>> | undefined} paper
 */
const listen = async (env, start, paper) => {
  const solanaEnv = loadSolanaEnv(hostEnv(env, paper));
  const runtime = ManagedRuntime.make(
    engineHostLayer(solanaEnv, env.SOLOS_LOG_LEVEL, env.OTEL_EXPORTER_OTLP_ENDPOINT),
  );
  try {
    const signer = await runtime.runPromise(Effect.flatMap(Signer, addressOf));
    if (paper !== undefined) await paper.fund(signer);
    const db = openIntents(path.join(start.dataDir, "intents.sqlite"));
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
    });
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
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
