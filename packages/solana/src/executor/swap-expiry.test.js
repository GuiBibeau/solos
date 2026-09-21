// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  BuildRejected,
  EventBusInMemory,
  TransactionExpired,
  executeSwap,
  simulateSwap,
} from "@solos/core";
import { Effect, Layer } from "effect";
import { SolanaTestLive } from "../index.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "../swap/jupiter-swap-build-bodies.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { startBuildFixture } from "../swap/jupiter-swap-build-http-fixture.js";

const BLOCKHASH = "11111111111111111111111111111111";
const intent = { inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT, slippageBps: 50 };
/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/** @param {number[]} heights @param {number} lastValid */
const startRpcFixture = (heights, lastValid) => {
  /** @type {string[]} */
  const calls = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const payload = /** @type {{ id: unknown; method: string }} */ (await request.json());
      calls.push(payload.method);
      const result = rpcResult(payload.method, heights, lastValid);
      return Response.json({ jsonrpc: "2.0", id: payload.id, result });
    },
  });
  const stop = () => server.stop(true);
  stops.push(stop);
  return { calls, stop, url: `http://127.0.0.1:${server.port}` };
};

/** @param {string} method @param {number[]} heights @param {number} lastValid */
const rpcResult = (method, heights, lastValid) => {
  if (method === "getAccountInfo") return { context: { slot: 1 }, value: null };
  if (method === "getLatestBlockhash") {
    return {
      context: { slot: 1 },
      value: { blockhash: BLOCKHASH, lastValidBlockHeight: lastValid },
    };
  }
  if (method === "getBlockHeight") return heights.shift() ?? lastValid;
  if (method === "simulateTransaction") {
    return { context: { slot: 1 }, value: { err: null, logs: [], unitsConsumed: 1 } };
  }
  throw new Error(`unexpected RPC method ${method}`);
};

/** @param {number[]} heights @param {number} lastValid
 * @param {{ face?: "execute" | "simulate"; skipSimulation?: boolean }} [options] */
const run = async (heights, lastValid, options = {}) => {
  const rpc = startRpcFixture(heights, lastValid);
  const build = startBuildFixture();
  stops.push(build.stop);
  const layer = Layer.merge(
    SolanaTestLive({
      rpcUrl: rpc.url,
      wsUrl: "ws://127.0.0.1:1",
      seed: randomSeed(),
      jupiter: { baseUrl: build.url, apiKey: KEY },
    }),
    EventBusInMemory,
  );
  const effect =
    options.face === "simulate"
      ? simulateSwap(intent)
      : executeSwap({ ...intent, skipSimulation: options.skipSimulation });
  const error = await failureOf(effect.pipe(Effect.provide(layer)));
  return { calls: rpc.calls, error };
};

describe("swap lifetime stages through the HTTP RPC adapter [integration]", () => {
  test("an RPC lifetime already expired is BuildRejected before signing", async () => {
    const { calls, error } = await run([201], 200);
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error)?.reason).toContain("before signing");
    expect(calls).toEqual(["getAccountInfo", "getLatestBlockhash", "getBlockHeight"]);
  });

  test("the inclusive last-valid height passes the pre-sign gate", async () => {
    const { calls, error } = await run([200, 201], 200, { skipSimulation: true });
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(calls).toEqual([
      "getAccountInfo",
      "getLatestBlockhash",
      "getBlockHeight",
      "getBlockHeight",
    ]);
  });

  test("expiry between signing and simulation is TransactionExpired with zero sends", async () => {
    const { calls, error } = await run([100, 201], 200);
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(calls).not.toContain("simulateTransaction");
    expect(calls).not.toContain("sendTransaction");
  });

  test("expiry after successful simulation is TransactionExpired with zero sends", async () => {
    const { calls, error } = await run([100, 100, 201], 200);
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(/** @type {TransactionExpired} */ (error)?.signature).toBeTruthy();
    expect(calls).toEqual([
      "getAccountInfo",
      "getLatestBlockhash",
      "getBlockHeight",
      "getBlockHeight",
      "simulateTransaction",
      "getBlockHeight",
    ]);
    expect(calls).not.toContain("sendTransaction");
  });

  test("expiry after signing with simulation skipped is TransactionExpired with zero sends", async () => {
    const { calls, error } = await run([100, 201], 200, { skipSimulation: true });
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(calls).toEqual([
      "getAccountInfo",
      "getLatestBlockhash",
      "getBlockHeight",
      "getBlockHeight",
    ]);
    expect(calls).not.toContain("simulateTransaction");
    expect(calls).not.toContain("sendTransaction");
  });

  test("the simulate surface reports post-sign expiry before RPC simulation", async () => {
    const { calls, error } = await run([100, 201], 200, { face: "simulate" });
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(calls).not.toContain("simulateTransaction");
  });
});
