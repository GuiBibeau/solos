// @ts-check
import { describe, expect, test } from "bun:test";
import { ActionExecutor, BuildRejected, TransactionFailed } from "@solos/core";
import { Cause, Effect, Exit, Layer, Option } from "effect";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSignerFromBytes } from "../signer/kit-signer.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { LAST_VALID_BLOCK_HEIGHT } from "../swap/jupiter-swap-build-bodies.js";
import { buildEnvelope, stubBuildLayer } from "../swap/jupiter-swap-build-fixture.js";
import { DirectSignerExecutor } from "./direct-signer-executor.js";
import { swapAction } from "./swap-sol-driver.js";

/**
 * Lifetime gating of the swap submission, over a scripted RPC: the build's lifetime is gated
 * before simulation, rechecked after a successful simulation, and only then is the transaction
 * sent once. An expiry during simulation therefore produces zero sends, and an explicit skip
 * gates exactly once. Nothing here needs a chain: the RPC is a scripted object, a send is a
 * recorded call, and the scripted confirm step fails into the honest TransactionFailed.
 */

const LAST_VALID = BigInt(LAST_VALID_BLOCK_HEIGHT);

/** @param {Exit.Exit<unknown, unknown>} exit */
const errorOf = (exit) => {
  if (Exit.isSuccess(exit)) return undefined;
  const failure = Cause.failureOption(exit.cause);
  return Option.isSome(failure) ? failure.value : undefined;
};

/**
 * A SolanaRpc layer whose block heights are scripted left to right (then pinned to expiry) and
 * whose calls are recorded in order.
 * @param {bigint[]} heights
 * @param {string[]} log
 */
const scriptedRpcLayer = (heights, log) =>
  Layer.succeed(
    SolanaRpc,
    /** @type {import("../rpc/solana-rpc.js").SolanaRpcShape} */
    (
      /** @type {any} */ ({
        url: "http://127.0.0.1:1",
        rpcSubscriptions: {},
        rpc: {
          getBlockHeight: () => ({
            send: async () => {
              log.push("getBlockHeight");
              return heights.shift() ?? LAST_VALID;
            },
          }),
          simulateTransaction: () => ({
            send: async () => {
              log.push("simulateTransaction");
              return { value: { err: null, logs: ["Program log: ok"], unitsConsumed: 4242n } };
            },
          }),
          sendTransaction: () => ({
            send: async () => {
              log.push("sendTransaction");
              return "5fQpYdeUq1mRVHqBh56f2XYL8DkYLRfYfB9hcvxNViUh";
            },
          }),
        },
      })
    ),
  );

/**
 * Run one swap execute over the scripted heights.
 * @param {bigint[]} heights
 * @param {boolean} skipSimulation
 */
const runExecute = async (heights, skipSimulation) => {
  const log = [];
  const layer = DirectSignerExecutor.pipe(
    Layer.provide(
      Layer.mergeAll(
        KitSignerFromBytes(randomSeed()),
        scriptedRpcLayer(heights, log),
        stubBuildLayer(async (params) => buildEnvelope({ taker: params.taker })),
      ),
    ),
  );
  const exit = await Effect.runPromiseExit(
    Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      return yield* executor.execute(swapAction, { skipSimulation });
    }).pipe(Effect.provide(layer)),
  );
  return { error: errorOf(exit), log };
};

describe("swap lifetime gating around simulation", () => {
  test("an expiry during simulation is refused with zero sends", async () => {
    const { error, log } = await runExecute([100n, LAST_VALID], false);
    expect(error).toBeInstanceOf(BuildRejected);
    expect(/** @type {BuildRejected} */ (error)?.reason).toContain("expired");
    expect(log.filter((call) => call === "getBlockHeight")).toHaveLength(2);
    expect(log).toContain("simulateTransaction");
    expect(log).not.toContain("sendTransaction");
  });

  test("a healthy build rechecks once and is sent exactly once", async () => {
    const { error, log } = await runExecute([100n, 100n], false);
    // The send is recorded; the scripted confirm step then fails honestly.
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(log.filter((call) => call === "sendTransaction")).toHaveLength(1);
    expect(log.filter((call) => call === "getBlockHeight")).toHaveLength(2);
  });

  test("an explicit skip gates exactly once, immediately before the send", async () => {
    const { error, log } = await runExecute([100n, LAST_VALID], true);
    // The second scripted height would have rejected: seeing a send proves the gate ran once.
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(log.filter((call) => call === "getBlockHeight")).toHaveLength(1);
    expect(log.filter((call) => call === "sendTransaction")).toHaveLength(1);
  });
});
