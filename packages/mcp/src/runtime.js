// @ts-check
import { EventBusInMemory, EventSinkNoop, LoggerJsonStderr, StoreInMemory } from "@solos/core";
import { SolanaLive } from "@solos/solana";
import { Layer, ManagedRuntime } from "effect";

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
