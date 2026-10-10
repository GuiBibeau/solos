// @ts-check
import { feature } from "bun:bundle";
import { LoggerJsonStderr } from "@solos/core";
import { SolanaLive } from "@solos/solana";
import { Layer } from "effect";
import { TracingLive } from "./tracing.js";

/**
 * The engine process signs locally. Callers that set `SOLOS_EXECUTOR=engine` must not leak
 * into this layer: the composition root forces `direct` before it gets here.
 * Feature flags are read only in this file (`feature()` from `bun:bundle`).
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
 * Strategy routes compiled into this process. Absent unless the binary was built or started
 * with the STRATEGIES flag. Release builds leave the flag off (ADR-0037).
 * @param {import("bun:sqlite").Database} db
 * @param {ReadonlyArray<string>} allowedMints
 */
export const compiledStrategyMount = async (db, allowedMints) => {
  if (feature("STRATEGIES")) {
    const [{ strategyLayer }, { handleStrategy }] = await Promise.all([
      import("./strategy-layer.js"),
      import("./strategy-http.js"),
    ]);
    return { layer: strategyLayer(db, allowedMints), handle: handleStrategy };
  }
  return undefined;
};
