// @ts-check
/**
 * Opening and closing through the real ActionExecutor over the offline Surfnet.
 *
 * Raydium accounts are seeded with the `surfnet_setAccount` cheatcode and the CLMM program is
 * never meaningfully invoked, so a simulation fails on the fork — which is the honest path under
 * test: a rejected build never simulates, a failed simulation never sends, and every guard that
 * matters for a funded round (range alignment, a range that buys nothing, a position that is not
 * yet empty) is refused before a single byte is signed.
 */
import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import {
  BuildRejected,
  LiquidityUnsupportedProtocol,
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
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

const TICK_SPACING = 60;

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

const seedPool = () =>
  seedRaydiumPool(surfnet.rpcUrl, {
    mint0: randomAddress(),
    mint1: randomAddress(),
    tickSpacing: TICK_SPACING,
  });

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

describe("raydium position lifecycle over Surfnet [integration]", () => {
  test("an aligned open builds, simulates the exact transaction, and sends nothing", async () => {
    const seed = randomSeed();
    const pool = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(simulateOpenPosition(openIntent({ pool })), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a range off the pool's tick spacing is refused, never rounded", async () => {
    const seed = randomSeed();
    const pool = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(
      simulateOpenPosition(openIntent({ pool, tickLower: -601 })),
      seed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("not aligned");
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain(String(TICK_SPACING));
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("budgets that buy no liquidity at this price are refused before simulation", async () => {
    const seed = randomSeed();
    const pool = await seedPool();
    const sims = rpc.callsFor("simulateTransaction").length;
    // The pool sits at tick 0, below a 600..1200 range, so only token A can be deposited —
    // a token B only budget buys nothing.
    const failure = await failureOf(
      simulateOpenPosition(openIntent({ pool, tickLower: 600, tickUpper: 1200, amountA: "0" })),
      seed,
    );
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("no liquidity");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("meteora fails the protocol gate before the executor reads anything", async () => {
    const seed = randomSeed();
    const reads = rpc.callsFor("getMultipleAccounts").length;
    const failure = await failureOf(
      simulateOpenPosition({
        ...openIntent({}),
        protocol: /** @type {"raydium"} */ ("meteora"),
      }),
      seed,
    );
    expect(failure).toBeInstanceOf(LiquidityUnsupportedProtocol);
    expect(rpc.callsFor("getMultipleAccounts").length).toBe(reads);
  });

  test("closing a position that still holds liquidity is refused before simulation", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const poolId = await seedPool();
    const { position } = await seedRaydiumPosition(surfnet.rpcUrl, {
      poolId,
      owner,
      liquidity: 10n ** 12n,
    });
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(simulateClosePosition({ protocol: "raydium", position }), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("remove it all first");
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("closing an emptied position builds and simulates, and the execute twin sends nothing", async () => {
    const seed = randomSeed();
    const owner = await seedAddress(seed);
    const poolId = await seedPool();
    const { position } = await seedRaydiumPosition(surfnet.rpcUrl, {
      poolId,
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
