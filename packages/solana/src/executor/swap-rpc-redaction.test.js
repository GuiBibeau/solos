// @ts-check
import { describe, expect, test } from "bun:test";
import { ActionExecutor, RpcError, TransactionFailed } from "@solos/core";
import { Effect, Layer } from "effect";
import { RPC_REQUEST_FAILED } from "../rpc/rpc-call.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { KitSignerFromBytes } from "../signer/kit-signer.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { buildEnvelope, failureOf, stubBuildLayer } from "../swap/jupiter-swap-build-fixture.js";
import { DirectSignerExecutor } from "./direct-signer-executor.js";
import { swapAction } from "./swap-sol-driver.js";
import { RPC_SUBMISSION_FAILED } from "./transfer-sol.js";

const SECRET = "qa-synthetic-rpc-secret";
const ORIGIN = "http://127.0.0.1:1";
const URL = `${ORIGIN}/v1/${SECRET}?api-key=${SECRET}`;

/** @param {"lifetime" | "simulation" | "send"} stage */
const rpcLayer = (stage) =>
  Layer.succeed(
    SolanaRpc,
    /** @type {any} */ ({
      url: URL,
      rpcSubscriptions: {},
      rpc: {
        getBlockHeight: () => ({
          send: async () => {
            if (stage === "lifetime") throw new Error(`provider echoed ${SECRET}`);
            return 100n;
          },
        }),
        simulateTransaction: () => ({
          send: async () => {
            if (stage === "simulation") throw new Error(`provider echoed ${SECRET}`);
            return { value: { err: null, logs: [], unitsConsumed: 1n } };
          },
        }),
        sendTransaction: () => ({
          send: async () => {
            throw new Error(`provider echoed ${SECRET}`);
          },
        }),
      },
    }),
  );

/** @param {"lifetime" | "simulation" | "send"} stage */
const failureAt = async (stage) => {
  const layer = DirectSignerExecutor.pipe(
    Layer.provide(
      Layer.mergeAll(
        KitSignerFromBytes(randomSeed()),
        rpcLayer(stage),
        stubBuildLayer(async (params) => buildEnvelope({ taker: params.taker })),
      ),
    ),
  );
  return failureOf(
    Effect.gen(function* () {
      const executor = yield* ActionExecutor;
      return yield* executor.execute(swapAction, { skipSimulation: stage !== "simulation" });
    }).pipe(Effect.provide(layer)),
  );
};

describe("swap RPC failure redaction", () => {
  test("lifetime and simulation failures expose only origin and a stable reason", async () => {
    for (const stage of /** @type {const} */ (["lifetime", "simulation"])) {
      const error = await failureAt(stage);
      expect(error).toBeInstanceOf(RpcError);
      expect(error).toMatchObject({ url: ORIGIN, reason: RPC_REQUEST_FAILED });
      expect(JSON.stringify(error)).not.toContain(SECRET);
    }
  });

  test("send failures preserve the signature but never provider text", async () => {
    const error = await failureAt("send");
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(error).toMatchObject({ reason: RPC_SUBMISSION_FAILED });
    expect(/** @type {TransactionFailed} */ (error)?.signature).toBeTruthy();
    expect(JSON.stringify(error)).not.toContain(SECRET);
  });
});
