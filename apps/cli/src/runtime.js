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
  Effect.suspend(() =>
    // `loadSolanaEnv` throws typed config errors; `Effect.try` turns them into a failed exit so the
    // CLI reports a code and a reason instead of a defect with a stack trace.
    Effect.try({
      try: () => loadSolanaEnv(process.env),
      catch: (error) => error,
    }).pipe(
      Effect.flatMap((env) =>
        effect.pipe(
          Effect.provide(makeToolLayer(env, { logLevel: process.env.SOLOS_LOG_LEVEL ?? "warn" })),
        ),
      ),
    ),
  );
