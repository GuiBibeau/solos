// @ts-check
import { Context, Effect, Layer } from "effect";
import { startSurfnet, surfnetCheatcodes } from "./surfnet-cli.js";

/**
 * Local Solana network for tests and dev. The CLI adapter spawns Surfpool; an embedded
 * `@solana/surfpool` adapter can replace it without touching callers.
 * @typedef {{
 *   readonly rpcUrl: string;
 *   readonly wsUrl: string;
 *   readonly fundSol: (owner: string, sol: number) => Effect.Effect<string, Error>;
 *   readonly setTokenAccount: (owner: string, mint: string, amount: number | string) => Effect.Effect<void, Error>;
 * }} SurfnetShape
 */

export const Surfnet = /** @type {Context.Tag<SurfnetShape, SurfnetShape>} */ (
  Context.GenericTag("@solos/solana/Surfnet")
);

/** @param {unknown} e */
const toError = (e) => (e instanceof Error ? e : new Error(String(e)));

/** @param {string} rpcUrl @param {string} wsUrl */
const shapeFor = (rpcUrl, wsUrl) => {
  const cheats = surfnetCheatcodes(rpcUrl);
  return /** @type {SurfnetShape} */ ({
    rpcUrl,
    wsUrl,
    fundSol: (owner, sol) =>
      Effect.tryPromise({ try: () => cheats.fundSol(owner, sol), catch: toError }),
    setTokenAccount: (owner, mint, amount) =>
      Effect.tryPromise({
        try: () => cheats.setTokenAccount(owner, mint, amount),
        catch: toError,
      }).pipe(Effect.asVoid),
  });
};

/**
 * Spawns Surfpool for the lifetime of the scope.
 * @param {import("./surfnet-cli.js").SurfnetOptions} options
 */
export const SurfnetCliLive = (options = {}) =>
  Layer.scoped(
    Surfnet,
    Effect.acquireRelease(
      Effect.tryPromise({ try: () => startSurfnet(options), catch: toError }),
      (handle) => Effect.promise(() => handle.stop()),
    ).pipe(Effect.map((handle) => shapeFor(handle.rpcUrl, handle.wsUrl))),
  );

/**
 * Attach to an already running Surfnet (or any RPC that answers cheatcodes).
 * @param {string} rpcUrl
 * @param {string} wsUrl
 */
export const SurfnetAttached = (rpcUrl, wsUrl) => Layer.succeed(Surfnet, shapeFor(rpcUrl, wsUrl));
