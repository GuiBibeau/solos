// @ts-check
/**
 * Opening and closing through the real ActionExecutor over the offline Surfnet.
 *
 * Raydium accounts are seeded with the `surfnet_setAccount` cheatcode and the CLMM program is
 * never meaningfully invoked, so a simulation fails on the fork — which is the honest path under
 * test: a rejected build never simulates, a failed simulation never sends, and every guard that
 * matters for a funded round (range alignment, a range that buys nothing, a side that cannot
 * pay, a position that is not yet empty) is refused before a single byte is signed.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  BuildRejected,
  LiquidityInputInvalid,
  SimulationFailed,
  executeClosePosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomAddress } from "../liquidity/liquidity-seeds.js";
import { seedRaydiumPool, seedRaydiumPosition } from "../liquidity/raydium-clmm-seeds.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { surfnetCheatcodes } from "../surfnet/surfnet-cli.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import { buildSignedRaydiumClose } from "./raydium-close-build.js";
import { buildSignedRaydiumOpen } from "./raydium-position-build.js";

const TICK_SPACING = 60;
const FUNDED = 10n ** 12n;

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
let layer;

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  layer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

/** @param {Partial<{ pool: string; tickLower: number; tickUpper: number; amountA: string; amountB: string }>} over */
const openIntent = (over) => ({
  protocol: /** @type {"raydium"} */ ("raydium"),
  pool: over.pool ?? randomAddress(),
  tickLower: over.tickLower ?? -600,
  tickUpper: over.tickUpper ?? 600,
  amountA: over.amountA ?? "1000000000",
  amountB: over.amountB ?? "1000000000",
  maxSlippageBps: 50,
});

/** A pool at tick 0, with its two mints so the signer's sides can be funded. */
const seedPool = async () => {
  const mint0 = randomAddress();
  const mint1 = randomAddress();
  const pool = await seedRaydiumPool(surfnet.rpcUrl, {
    mint0,
    mint1,
    tickSpacing: TICK_SPACING,
  });
  return { pool, mint0, mint1 };
};

/** @param {string} owner @param {string[]} mints */
const fund = async (owner, mints) => {
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  for (const mint of mints) await cheats.setTokenAccount(owner, mint, FUNDED);
};

/**
 * @param {Effect.Effect<unknown, unknown, never>} effect
 * @param {Uint8Array} seed
 * @returns {Promise<unknown>} the typed domain failure, or throws on an unexpected defect
 */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, layer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

/** @param {unknown} failure */
const reasonOf = (failure) => /** @type {BuildRejected} */ (failure)?.reason;

describe("raydium position lifecycle over Surfnet [integration]", () => {
  test("a funded in-range open builds, simulates the exact transaction, and sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { pool, mint0, mint1 } = await seedPool();
    await fund(owner, [mint0, mint1]);
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(simulateOpenPosition(openIntent({ pool })), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a one-sided open creates the side it does not spend from and still simulates", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { pool, mint1 } = await seedPool();
    // The pool sits at tick 0, above a -1200..-600 range, so the position is all token B and
    // token A's account is never funded — Raydium still requires it to exist.
    await fund(owner, [mint1]);
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(
      simulateOpenPosition(openIntent({ pool, tickLower: -1200, tickUpper: -600, amountA: "0" })),
      seed,
    );
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
  });

  test("a side the open needs but cannot pay for is named before simulation", async () => {
    const seed = randomSeed();
    await seedAddress(seed);
    const { pool } = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(simulateOpenPosition(openIntent({ pool })), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(reasonOf(failure)).toContain("insufficient token A");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("a range off the pool's tick spacing is refused, never rounded", async () => {
    const seed = randomSeed();
    const { pool } = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(
      simulateOpenPosition(openIntent({ pool, tickLower: -601 })),
      seed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(reasonOf(failure)).toContain("not aligned");
    expect(reasonOf(failure)).toContain(String(TICK_SPACING));
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("budgets that buy no liquidity at this price are refused before simulation", async () => {
    const seed = randomSeed();
    const { pool } = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    // The pool sits at tick 0, below a 600..1200 range, so only token A can be deposited —
    // a token B only budget buys nothing.
    const failure = await failureOf(
      simulateOpenPosition(openIntent({ pool, tickLower: 600, tickUpper: 1200, amountA: "0" })),
      seed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(reasonOf(failure)).toContain("no liquidity");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("the builder itself refuses a non-raydium lifecycle action, whatever reached it", async () => {
    const seed = randomSeed();
    const kit = { signer: { address: await seedAddress(seed) } };
    const ctx = /** @type {any} */ ({});
    const open = await Effect.runPromiseExit(
      buildSignedRaydiumOpen(
        { ctx, kit: /** @type {any} */ (kit) },
        {
          ...openIntent({}),
          protocol: "orca",
        },
      ),
    );
    const close = await Effect.runPromiseExit(
      buildSignedRaydiumClose(
        { ctx, kit: /** @type {any} */ (kit) },
        {
          protocol: "orca",
          position: randomAddress(),
        },
      ),
    );
    // No ctx at all: the refusal happens before anything reads, so an orca open can never be
    // built as a Raydium transaction even when it bypasses the use case's gate.
    for (const [exit, type] of [
      [open, "open_position"],
      [close, "close_position"],
    ]) {
      expect(/** @type {any} */ (exit)._tag).toBe("Failure");
      const failure = Cause.failureOption(/** @type {any} */ (exit).cause);
      expect(Option.isSome(failure)).toBe(true);
      expect(Option.getOrThrow(failure)).toMatchObject({ actionType: `${type}:orca` });
    }
  });

  test("a tick-shaped meteora open is refused before any read or send", async () => {
    const seed = randomSeed();
    const reads = rpc.callsFor("getMultipleAccounts").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(
      simulateOpenPosition({
        ...openIntent({}),
        protocol: /** @type {"raydium"} */ ("meteora"),
      }),
      seed,
    );
    expect(failure).toBeInstanceOf(LiquidityInputInvalid);
    expect(reasonOf(failure)).toContain("lowerBinId");
    expect(rpc.callsFor("getMultipleAccounts").length).toBe(reads);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("closing a position that still holds liquidity is refused before simulation", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { pool } = await seedPool();
    const { position } = await seedRaydiumPosition(surfnet.rpcUrl, {
      poolId: pool,
      owner,
      liquidity: 10n ** 12n,
    });
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(simulateClosePosition({ protocol: "raydium", position }), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(reasonOf(failure)).toContain("remove it all first");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  // This says a build reaches simulation and an execute still sends nothing; it says nothing
  // about what is in the transaction, because the seeded pool makes every simulation fail for
  // the same reason whatever was built. `raydium-close-nft-program-surfnet.test.js` asserts the
  // accounts on the wire instead, which is the only way that property can be checked here.
  test("closing an emptied position builds and simulates, and the execute twin sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const { pool } = await seedPool();
    const { position } = await seedRaydiumPosition(surfnet.rpcUrl, {
      poolId: pool,
      owner,
      liquidity: 0n,
    });
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const simulated = await failureOf(
      simulateClosePosition({ protocol: "raydium", position }),
      seed,
    );
    expect(simulated).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
    const executed = await failureOf(
      executeClosePosition({ protocol: "raydium", position, skipSimulation: false }),
      seed,
    );
    expect(executed).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });
});
