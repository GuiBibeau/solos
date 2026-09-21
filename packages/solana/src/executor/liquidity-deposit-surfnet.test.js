// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { tickIndexToSqrtPrice } from "@orca-so/whirlpools-core";
import {
  BuildRejected,
  executeDeposit,
  LiquidityUnsupportedProtocol,
  SimulationFailed,
  simulateDeposit,
} from "@solos/core";
import { Cause, Effect, Option } from "effect";
import { SolanaTestLive } from "../index.js";
import { seedWhirlpool, seedWhirlpoolPosition } from "../liquidity/liquidity-seeds.js";
import { SQRT_PRICE_ONE } from "../liquidity/whirlpool-fixture.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { surfnetCheatcodes } from "../surfnet/surfnet-cli.js";
import { ensureOfflineSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";

/**
 * The deposit twins through the real ActionExecutor over the offline Surfnet: synthetic
 * Whirlpool accounts are seeded with the `surfnet_setAccount` cheatcode and the Whirlpool
 * program is never meaningfully invoked — a simulation therefore fails on chain, which is
 * exactly the honest path under test: failed simulations send nothing, rejected builds
 * never even simulate, and no deposit is live-executed until #31 exists.
 */

/** @type {Awaited<ReturnType<typeof ensureOfflineSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** @type {(seed: Uint8Array) => import("effect").Layer.Layer<any>} */
let depositLayer;
let owner = "";

const intent = (pool, position) => ({
  protocol: /** @type {"orca"} */ ("orca"),
  pool,
  position,
  amountA: "1000000000",
  amountB: "1000000000",
  maxSlippageBps: 50,
});

beforeAll(async () => {
  surfnet = await ensureOfflineSurfnet();
  rpc = startRpcRecorder(surfnet.rpcUrl);
  depositLayer = (seed) => SolanaTestLive({ rpcUrl: rpc.url, wsUrl: surfnet.wsUrl, seed });
});

afterAll(() => {
  rpc.stop();
});

/**
 * Seed one self-consistent pool+position family for `owner` and return its addresses.
 * `belowRange` prices the pool far below the position's range (one-sided adds); `skipB`
 * leaves the signer's token B funding account absent so the driver must create it.
 * @param {{ belowRange?: boolean; skipB?: boolean }} [options]
 */
const seedFamily = async (options = {}) => {
  const cheats = surfnetCheatcodes(surfnet.rpcUrl);
  // The in-range family keeps the price strictly inside the range (boundary-exact prices
  // degenerate the quote to one-sided); the below-range variant puts the price far under it.
  const sqrtPrice = options.belowRange === true ? tickIndexToSqrtPrice(-2000) : SQRT_PRICE_ONE;
  const pool = await seedWhirlpool(surfnet.rpcUrl, { sqrtPrice });
  const position = await seedWhirlpoolPosition(surfnet.rpcUrl, {
    pool: pool.pool,
    owner,
    liquidity: 0n,
    tickLowerIndex: options.belowRange === true ? 0 : -1000,
    tickUpperIndex: 1000,
  });
  // The signer funds both sides: balances comfortably above any quote for these budgets.
  await cheats.setTokenAccount(owner, pool.mintA, 10n ** 12n);
  if (options.skipB !== true) await cheats.setTokenAccount(owner, pool.mintB, 10n ** 12n);
  return { pool, position };
};

/**
 * @param {Effect.Effect<unknown, unknown, never>} effect
 * @param {Uint8Array} seed
 * @returns {Promise<unknown>} the typed domain failure, or throws on unexpected defects
 */
const failureOf = async (effect, seed) => {
  const exit = await Effect.runPromiseExit(Effect.provide(effect, depositLayer(seed)));
  if (exit._tag !== "Failure") throw new Error("expected a domain failure");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`not a failure value: ${String(exit.cause)}`);
  return Option.getOrThrow(failure);
};

describe("liquidity deposit executor against Surfnet [integration]", () => {
  test("a valid in-range deposit simulates, fails honestly on the fork, and sends nothing", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { pool, position } = await seedFamily();
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(simulateDeposit(intent(pool.pool, position.position)), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a one-sided below-range add without a token B account creates it and simulates", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { pool, position } = await seedFamily({ belowRange: true, skipB: true });
    const sims = rpc.callsFor("simulateTransaction").length;
    const failure = await failureOf(
      simulateDeposit({ ...intent(pool.pool, position.position), amountB: "0" }),
      seed,
    );
    // The build succeeds — the driver prepends the idempotent B ATA create — and the exact
    // transaction reaches simulation, failing honestly on the fork (synthetic accounts).
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims + 1);
  });

  test("a rejected build never simulates and never sends", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { pool, position } = await seedFamily();
    const sends = rpc.callsFor("sendTransaction").length;
    const sims = rpc.callsFor("simulateTransaction").length;
    // Position belongs to `pool.pool`; asking to deposit into a different pool is rejected.
    const failure = await failureOf(simulateDeposit(intent(pool.mintA, position.position)), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain("different pool");
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("an insufficient token B balance is rejected before simulation", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { pool, position } = await seedFamily();
    const sims = rpc.callsFor("simulateTransaction").length;
    // Overwrite the B ATA with a dust balance via a fresh seed of the same account.
    const cheats = surfnetCheatcodes(surfnet.rpcUrl);
    await cheats.setTokenAccount(owner, pool.mintB, 1);
    const failure = await failureOf(simulateDeposit(intent(pool.pool, position.position)), seed);
    expect(failure).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (failure)?.reason).toContain(
      "insufficient token B balance",
    );
    expect(rpc.callsFor("simulateTransaction").length).toBe(sims);
  });

  test("meteora fails the protocol gate before the executor touches anything", async () => {
    const seed = randomSeed();
    const reads = rpc.callsFor("getMultipleAccounts").length;
    const failure = await failureOf(
      simulateDeposit({
        ...intent("1".repeat(44), "2".repeat(44)),
        protocol: /** @type {"orca"} */ ("meteora"),
      }),
      seed,
    );
    expect(failure).toBeInstanceOf(LiquidityUnsupportedProtocol);
    expect(rpc.callsFor("getMultipleAccounts").length).toBe(reads);
  });

  test("the execute twin also refuses to send when its simulation fails", async () => {
    const seed = randomSeed();
    owner = await seedAddress(seed);
    const { pool, position } = await seedFamily();
    const sends = rpc.callsFor("sendTransaction").length;
    const failure = await failureOf(executeDeposit(intent(pool.pool, position.position)), seed);
    expect(failure).toBeInstanceOf(SimulationFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });
});
