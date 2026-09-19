// @ts-check
import { EventBusInMemory, EventSinkNoop, LoggerJsonStderr, StoreInMemory } from "@solos/core";
import { SolanaLive } from "@solos/solana";
import { Effect, Layer, ManagedRuntime } from "effect";

/**
 * @typedef {{
 *   observe: (toolName: string, error: unknown) => Promise<void>;
 *   dispose: () => Promise<void>;
 * }} PreflightTelemetry
 */

/**
 * Everything the tools need, from validated env. Composition happens here and only here.
 * @param {import("@solos/solana").SolanaEnv} env
 * @param {{ logLevel?: string }} [options]
 */
export const makeToolLayer = (env, options = {}) =>
  Layer.mergeAll(SolanaLive(env), EventBusInMemory, EventSinkNoop, StoreInMemory).pipe(
    Layer.provideMerge(LoggerJsonStderr(options.logLevel)),
  );

/**
 * @param {import("@solos/solana").SolanaEnv} env
 * @param {{ logLevel?: string }} [options]
 */
export const makeToolRuntime = (env, options = {}) =>
  ManagedRuntime.make(makeToolLayer(env, options));

/**
 * Signer-independent telemetry for pure input-guard rejections (ADR-0011): the `mcp.tool.*`
 * span and a `tool.failed` warning through the stderr JSON logger. This is the MCP composition
 * root (ADR-0003), so `ManagedRuntime.make` and `Effect.run*` stay here; the Solana layers are
 * never built, which is what lets an amount be validated without a loadable signer.
 * @param {{ logLevel?: string }} [options]
 * @returns {PreflightTelemetry}
 */
export const makePreflightTelemetry = (options = {}) => {
  const runtime = ManagedRuntime.make(LoggerJsonStderr(options.logLevel));
  return {
    /**
     * Observe one rejection. Never throws: telemetry must not mask the structured error.
     * @param {string} toolName
     * @param {unknown} error
     */
    observe: (toolName, error) => {
      const observed = Effect.logWarning("tool.failed").pipe(
        Effect.annotateLogs({ tool: toolName, cause: String(error) }),
        Effect.withSpan(`mcp.tool.${toolName}`),
      );
      return runtime.runPromise(observed).catch(() => undefined);
    },
    dispose: () => runtime.dispose(),
  };
};
