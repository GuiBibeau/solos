// @ts-check
/** @typedef {import("./test-seeds.js").LaunchFixtureMints} LaunchFixtureMints */
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { getCurve } from "@solos/core/launch";
import { Cause, Effect, Layer, Option } from "effect";
import { ensureSurfnet } from "@solos/solana/surfnet";
import { LaunchVenueLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { seedLaunchFixtures } from "./test-seeds.js";

/**
 * Shared harness for the launch-curve adapter tests against the offline shared Surfnet:
 * seeds the fixture family once per caller, builds the live `LaunchVenue` layer over the
 * Surfnet RPC, and exposes one use-case read that returns the LaunchCurve or the tagged
 * domain error. The pump program is never invoked; accounts are written with the
 * `surfnet_setAccount` cheatcode, exactly like the market slice's fixtures.
 */

/**
 * Seed the Surfnet and build the live launch-venue layer over it.
 * @returns {Promise<{ mints: LaunchFixtureMints; readCurve: (mint: string) => Promise<unknown> }>}
 */
export const startLaunchVenueFixture = async () => {
  const surfnet = await ensureSurfnet();
  const mints = await seedLaunchFixtures(surfnet.rpcUrl);
  const layer = LaunchVenueLive({ timeoutMs: 10_000 }).pipe(
    Layer.provide(
      Layer.succeed(SolanaRpc, {
        url: surfnet.rpcUrl,
        rpc: createSolanaRpc(surfnet.rpcUrl),
        rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
      }),
    ),
  );
  const readCurve = async (/** @type {string} */ mint) => {
    const exit = await Effect.runPromiseExit(getCurve({ mint }).pipe(Effect.provide(layer)));
    if (exit._tag === "Failure") {
      const failure = Cause.failureOption(exit.cause);
      if (Option.isNone(failure)) throw new Error(`expected a domain error: ${String(exit.cause)}`);
      return /** @type {object} */ (failure.value);
    }
    return exit.value;
  };
  return { mints, readCurve };
};

/** The fresh-curve body every SOL-paired full-layout fixture shares. @param {string} mint @param {{ progressBps?: number; complete?: boolean }} [overrides] */
export const expectedCurve = (mint, overrides = {}) => ({
  mint,
  program: PUMP_PROGRAM,
  complete: false,
  progressBps: 0,
  virtualSolReserves: "30000000000",
  virtualTokenReserves: "1073000000000000",
  ...overrides,
});
