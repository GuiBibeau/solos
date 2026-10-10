// @ts-check
import { LoggerJsonStderr } from "@solos/core";
import { SolanaLive } from "@solos/solana";
import { Layer } from "effect";
import { TracingLive } from "./tracing.js";

/**
 * The engine process signs locally. Callers that set `SOLOS_EXECUTOR=engine` must not leak
 * into this layer: the composition root forces `direct` before it gets here.
 * Feature flags are read only in this file (`feature()` from `bun:bundle`). None ship yet.
 * @param {import("@solos/solana").SolanaEnv} solanaEnv
 * @param {string | undefined} logLevel
 * @param {string | undefined} otelEndpoint
 */
export const engineHostLayer = (solanaEnv, logLevel, otelEndpoint) =>
  SolanaLive(solanaEnv).pipe(
    Layer.provideMerge(TracingLive(otelEndpoint, "solos-engine")),
    Layer.provideMerge(LoggerJsonStderr(logLevel ?? "info")),
  );
