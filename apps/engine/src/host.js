// @ts-check
import { LoggerJsonStderr } from "@solos/core";
import { SolanaLive } from "@solos/solana";
import { Layer } from "effect";
import { TracingLive } from "./tracing.js";

/**
 * The engine process signs locally. Callers that set `SOLOS_EXECUTOR=engine` must not leak
 * into this layer: the composition root forces `direct` before it gets here.
 * @param {import("@solos/solana").SolanaEnv} solanaEnv
 * @param {string | undefined} logLevel
 * @param {string | undefined} otelEndpoint
 */
export const engineHostLayer = (solanaEnv, logLevel, otelEndpoint) =>
  SolanaLive(solanaEnv).pipe(
    Layer.provideMerge(TracingLive(otelEndpoint, "solos-engine")),
    Layer.provideMerge(LoggerJsonStderr(logLevel ?? "info")),
  );

/**
 * Strategy routes compiled into this process. Release builds include them (ADR-0037).
 * @param {import("bun:sqlite").Database} db
 * @param {import("./strategy-layer.js").StrategyLayerOptions} options
 */
export const compiledStrategyMount = async (db, options) => {
  const [{ strategyLayer }, { handleStrategy }] = await Promise.all([
    import("./strategy-layer.js"),
    import("./strategy-http.js"),
  ]);
  return { layer: strategyLayer(db, options), handle: handleStrategy };
};
