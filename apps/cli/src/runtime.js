// @ts-check
import { makeToolLayer } from "@solos/mcp";
import { loadSolanaEnv } from "@solos/solana";
import { Effect } from "effect";

/**
 * Provide the Solana tool layer lazily, so commands that do not touch the chain
 * (`solos dev surfpool up`) run without SOLANA_RPC_URL.
 * @template A, E, R
 * @param {Effect.Effect<A, E, R>} effect
 */
export const withSolos = (effect) =>
  Effect.suspend(() => {
    const env = loadSolanaEnv(process.env);
    return effect.pipe(
      Effect.provide(makeToolLayer(env, { logLevel: process.env.SOLOS_LOG_LEVEL ?? "warn" })),
    );
  });
