// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  BuildRejected,
  BuildUnavailable,
  EventBusInMemory,
  SimulationFailed,
  TransactionFailed,
  executeSwap,
  simulateSwap,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { startRpcRecorder } from "../surfnet/rpc-recorder.js";
import { jsonRpc } from "../surfnet/surfnet-cli.js";
import { ensureSurfnet, randomSeed, seedAddress } from "../surfnet/test-surfnet.js";
import {
  AMOUNT,
  BLOCKHASH_BYTES,
  INPUT_MINT,
  KEY,
  OUTPUT_MINT,
} from "../swap/jupiter-swap-build-bodies.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { startBuildFixture } from "../swap/jupiter-swap-build-http-fixture.js";

/**
 * The swap executor against Surfnet through the real ActionExecutor, the real Jupiter build
 * transport (loopback fixture), and the real RPC (recording proxy): a failed simulation is a
 * SimulationFailed with zero sends, an explicit skip is sent exactly once and honestly fails on
 * chain, provider lifetime metadata cannot choose the signed lifetime, a missing key fails
 * pre-HTTP, and cleanup never closes a pre-existing taker wSOL ATA.
 */

const intent = { inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT, slippageBps: 50 };
const EXPIRED = {
  blockhashWithMetadata: {
    blockhash: [...BLOCKHASH_BYTES],
    lastValidBlockHeight: 1,
    fetchedAt: { secs_since_epoch: 0, nanos_since_epoch: 0 },
  },
};

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;
/** @type {ReturnType<typeof startBuildFixture>} */
let expired;
/** @type {ReturnType<typeof startRpcRecorder>} */
let rpc;
/** The taker of the run under test; each test that builds sets it from its own signer. */
let taker = "";
/** @type {(baseUrl: string, seed: Uint8Array, key?: string) => Layer.Layer<any>} */
let swapLayer;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startBuildFixture();
  expired = startBuildFixture({ overrides: EXPIRED });
  rpc = startRpcRecorder(surfnet.rpcUrl);
  swapLayer = (baseUrl, seed, key) =>
    Layer.merge(
      SolanaTestLive({
        rpcUrl: rpc.url,
        wsUrl: surfnet.wsUrl,
        seed,
        jupiter: key === undefined ? { baseUrl } : { baseUrl, apiKey: key },
      }),
      EventBusInMemory,
    );
});

afterAll(() => {
  fixture?.stop();
  expired?.stop();
  rpc?.stop();
});

/** @param {string} owner */
const lamportsOf = async (owner) => {
  const result = /** @type {{ value: Array<number> }} */ (
    await jsonRpc(surfnet.rpcUrl, "getBalance", [owner])
  );
  return result.value[0];
};

describe("the swap executor against Surfnet [integration]", () => {
  test("a failed simulation is a SimulationFailed and nothing is sent", async () => {
    const seed = randomSeed();
    taker = await seedAddress(seed);
    const before = await lamportsOf(taker);
    const sends = rpc.callsFor("sendTransaction").length;
    const error = await failureOf(
      simulateSwap(intent).pipe(Effect.provide(swapLayer(fixture.url, seed, KEY))),
    );
    expect(error).toBeInstanceOf(SimulationFailed);
    expect(await lamportsOf(taker)).toBe(before);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]?.taker).toBe(taker);
  });

  test("an explicitly un-simulated execution is sent once and fails honestly on chain", async () => {
    const seed = randomSeed();
    taker = await seedAddress(seed);
    await surfnet.cheats.fundSol(taker, 1);
    const sends = rpc.callsFor("sendTransaction").length;
    const error = await failureOf(
      executeSwap({ ...intent, skipSimulation: true }).pipe(
        Effect.provide(swapLayer(fixture.url, seed, KEY)),
      ),
    );
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error)?.signature).toBeTruthy();
    expect(rpc.callsFor("sendTransaction").length).toBe(sends + 1);
  });

  test("provider expiry metadata is replaced by the configured RPC lifetime", async () => {
    const seed = randomSeed();
    taker = await seedAddress(seed);
    await surfnet.cheats.fundSol(taker, 1);
    const sends = rpc.callsFor("sendTransaction").length;
    const error = await failureOf(
      executeSwap({ ...intent, skipSimulation: true }).pipe(
        Effect.provide(swapLayer(expired.url, seed, KEY)),
      ),
    );
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends + 1);
    expect(expired.requests).toHaveLength(1);
  });

  test("cleanup rejects a pre-existing taker wSOL ATA with zero simulation and sends", async () => {
    const seed = randomSeed();
    taker = await seedAddress(seed);
    await surfnet.cheats.setTokenAccount(taker, INPUT_MINT, 0);
    const simulations = rpc.callsFor("simulateTransaction").length;
    const sends = rpc.callsFor("sendTransaction").length;
    const error = await failureOf(
      executeSwap({ ...intent, skipSimulation: true }).pipe(
        Effect.provide(swapLayer(fixture.url, seed, KEY)),
      ),
    );
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error)?.reason).toContain("pre-existing");
    expect(rpc.callsFor("simulateTransaction").length).toBe(simulations);
    expect(rpc.callsFor("sendTransaction").length).toBe(sends);
  });

  test("a missing Jupiter key fails pre-HTTP with zero build requests", async () => {
    const before = fixture.requests.length;
    const error = await failureOf(
      simulateSwap(intent).pipe(Effect.provide(swapLayer(fixture.url, randomSeed()))),
    );
    expect(error).toBeInstanceOf(BuildUnavailable);
    expect(fixture.requests.length).toBe(before);
  });
});
