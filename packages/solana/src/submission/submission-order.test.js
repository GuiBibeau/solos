// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import {
  BuildRejected,
  SimulationFailed,
  TransactionExpired,
  TransactionFailed,
} from "@solos/core";
import { Effect } from "effect";
import { buildSignedTransfer } from "../executor/transfer-sol.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { failureOf } from "../swap/jupiter-swap-build-fixture.js";
import { MAY_HAVE_LANDED } from "./confirm.js";
import { EXPIRED_AFTER_SIGNING } from "./lifetime.js";
import { SLOW } from "./mode.js";
import { simulateSigned, submitSigned } from "./submission.js";
import { rpcSubmitter } from "./submitter.js";

const LAST_VALID = 200;
/** @type {Array<() => void>} */
const stops = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

/**
 * A scripted JSON-RPC node that records every method it is asked, in order. Heights and statuses
 * are consumed one per call, then default to live and confirmed. `failSend` refuses every send;
 * `statusResult` replaces the whole status response, malformed on purpose when asked.
 * @param {{ heights?: number[]; simErr?: unknown; statuses?: string[]; failSend?: boolean; statusResult?: unknown }} [script]
 */
const startNode = (script = {}) => {
  /** @type {string[]} */
  const calls = [];
  /** @type {unknown[][]} */
  const params = [];
  const heights = [...(script.heights ?? [])];
  const statuses = [...(script.statuses ?? ["confirmed"])];
  /** @type {Record<string, () => unknown>} */
  const results = {
    getLatestBlockhash: () => ({
      context: { slot: 1 },
      value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: LAST_VALID },
    }),
    getBlockHeight: () => heights.shift() ?? 100,
    simulateTransaction: () => ({
      context: { slot: 1 },
      value: { err: script.simErr ?? null, logs: ["log"], unitsConsumed: 7, accounts: null },
    }),
    sendTransaction: () => "1".repeat(64),
    getSignatureStatuses: () =>
      "statusResult" in script
        ? script.statusResult
        : {
            context: { slot: 1 },
            value: [
              {
                slot: 1,
                confirmations: 0,
                err: null,
                confirmationStatus: statuses.shift() ?? "confirmed",
              },
            ],
          },
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const payload = /** @type {{ id: unknown; method: string; params: unknown[] }} */ (
        await request.json()
      );
      calls.push(payload.method);
      params.push(payload.params);
      if (script.failSend === true && payload.method === "sendTransaction") {
        const error = { code: -32_603, message: "send refused" };
        return Response.json({ jsonrpc: "2.0", id: payload.id, error });
      }
      const result = results[payload.method];
      if (result === undefined) throw new Error(`unexpected RPC method ${payload.method}`);
      return Response.json({ jsonrpc: "2.0", id: payload.id, result: result() });
    },
  });
  stops.push(() => server.stop(true));
  const url = `http://127.0.0.1:${server.port}`;
  const ctx = {
    url,
    rpc: createSolanaRpc(url),
    rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:1"),
  };
  return { calls, params, ctx };
};

/**
 * Sign one real v1 transfer against the node, then forget the build's own calls so each test
 * sees only what Submission asked.
 * @param {ReturnType<typeof startNode>} node
 * @param {import("./mode.js").SubmissionMode} [mode]
 */
const prepare = async (node, mode = SLOW) => {
  const signer = await createMemorySignerFromBytes(randomSeed());
  const signed = await Effect.runPromise(
    buildSignedTransfer(
      node.ctx,
      { backend: "memory", signer },
      { type: "transfer_sol", to: signer.address, lamports: "1000" },
    ),
  );
  node.calls.length = 0;
  node.params.length = 0;
  const deps = { ctx: node.ctx, submitter: rpcSubmitter(node.ctx), mode };
  return { signed, deps };
};

/** @param {string[]} calls @param {string} label */
const mark = (calls, label) => Effect.sync(() => void calls.push(label));

const ALWAYS = { skipSimulation: false };
const SKIP = { skipSimulation: true };

describe("Submission runs one order of steps through the RPC Submitter [integration]", () => {
  test("slow: lifetime, simulate, lifetime, send, confirm", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const delivered = await Effect.runPromise(submitSigned(deps, { signed }, ALWAYS));
    expect(node.calls).toEqual([
      "getBlockHeight",
      "simulateTransaction",
      "getBlockHeight",
      "sendTransaction",
      "getSignatureStatuses",
    ]);
    expect(delivered.simulated).toBe(true);
    expect(delivered.signature.length).toBeGreaterThan(60);
  });

  test("an explicit skip leaves one lifetime check, right before the send", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const delivered = await Effect.runPromise(submitSigned(deps, { signed }, SKIP));
    expect(node.calls).toEqual(["getBlockHeight", "sendTransaction", "getSignatureStatuses"]);
    expect(delivered.simulated).toBe(false);
  });

  test("a venue that requires simulation keeps it through a Caller's skip", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const request = { signed, requireSimulation: true };
    const delivered = await Effect.runPromise(submitSigned(deps, request, SKIP));
    expect(node.calls.slice(0, 3)).toEqual([
      "getBlockHeight",
      "simulateTransaction",
      "getBlockHeight",
    ]);
    expect(delivered.simulated).toBe(true);
  });

  test("the venue guard runs after simulation, and its refusal sends nothing", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const guard = Effect.zipRight(
      mark(node.calls, "guard"),
      Effect.fail(new BuildRejected({ reason: "venue moved" })),
    );
    const error = await failureOf(submitSigned(deps, { signed, guard }, ALWAYS));
    expect(error).toBeInstanceOf(BuildRejected);
    expect(node.calls).toEqual(["getBlockHeight", "simulateTransaction", "guard"]);
  });

  test("a guard without simulation still gets a lifetime check after it", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const guard = mark(node.calls, "guard");
    await Effect.runPromise(submitSigned(deps, { signed, guard }, SKIP));
    expect(node.calls.slice(0, 4)).toEqual([
      "getBlockHeight",
      "guard",
      "getBlockHeight",
      "sendTransaction",
    ]);
  });

  test("expiry after a clean simulation is TransactionExpired with zero sends", async () => {
    const node = startNode({ heights: [100, LAST_VALID + 1] });
    const { signed, deps } = await prepare(node);
    const error = await failureOf(submitSigned(deps, { signed }, ALWAYS));
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(/** @type {TransactionExpired} */ (error).reason).toBe(EXPIRED_AFTER_SIGNING);
    expect(/** @type {TransactionExpired} */ (error).signature).toBeTruthy();
    expect(node.calls).not.toContain("sendTransaction");
  });

  test("the last valid height is still live", async () => {
    const node = startNode({ heights: [LAST_VALID, LAST_VALID] });
    const { signed, deps } = await prepare(node);
    await Effect.runPromise(submitSigned(deps, { signed }, ALWAYS));
    expect(node.calls).toContain("sendTransaction");
  });

  test("a failed simulation refuses the send and is reported by the simulate tier", async () => {
    const node = startNode({ simErr: { InstructionError: [0, { Custom: 1 }] } });
    const { signed, deps } = await prepare(node);
    const error = await failureOf(submitSigned(deps, { signed }, ALWAYS));
    expect(error).toBeInstanceOf(SimulationFailed);
    expect(node.calls).not.toContain("sendTransaction");
    const simulated = await Effect.runPromise(simulateSigned(deps, { signed }));
    expect(simulated.err).not.toBeNull();
    expect(simulated.logs).toEqual(["log"]);
  });

  test("a probe reads strictly before simulating, observes its accounts, and can refuse", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const watched = (await createMemorySignerFromBytes(randomSeed())).address;
    const probe = {
      accounts: [watched],
      before: Effect.as(mark(node.calls, "before"), 5n),
      verdict: (/** @type {unknown} */ _outcome, /** @type {unknown} */ before) =>
        Effect.fail(new SimulationFailed({ reason: `bounded at ${before}`, logs: [] })),
    };
    const error = await failureOf(submitSigned(deps, { signed, probe }, ALWAYS));
    expect(/** @type {SimulationFailed} */ (error).reason).toBe("bounded at 5");
    expect(node.calls).toEqual(["getBlockHeight", "before", "simulateTransaction"]);
    expect(JSON.stringify(node.params[1])).toContain(watched);
  });

  test("the simulate tier keeps the probe's verdict", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const probe = { verdict: () => Effect.succeed({ quoted: true }) };
    const simulated = await Effect.runPromise(simulateSigned(deps, { signed, probe }));
    expect(simulated.verdict).toEqual({ quoted: true });
    expect(node.calls).toEqual(["getBlockHeight", "simulateTransaction"]);
  });

  test("a mode without rechecks never reads the block height", async () => {
    const mode = { ...SLOW, name: "unchecked", lifetime: { ...SLOW.lifetime, recheck: false } };
    const node = startNode();
    const { signed, deps } = await prepare(node, mode);
    await Effect.runPromise(submitSigned(deps, { signed }, ALWAYS));
    expect(node.calls).toEqual(["simulateTransaction", "sendTransaction", "getSignatureStatuses"]);
  });

  test("minimum remaining blocks refuses a live but nearly spent lifetime", async () => {
    const lifetime = { ...SLOW.lifetime, minBlocksRemaining: 10 };
    const node = startNode({ heights: [LAST_VALID - 5] });
    const { signed, deps } = await prepare(node, { ...SLOW, name: "headroom", lifetime });
    const error = await failureOf(submitSigned(deps, { signed }, ALWAYS));
    expect(error).toBeInstanceOf(TransactionExpired);
    expect(/** @type {TransactionExpired} */ (error).reason).toContain("fewer than 10 blocks");
    expect(node.calls).toEqual(["getBlockHeight"]);
  });

  test("a finalized confirmation keeps polling past a confirmed row", async () => {
    const confirmation = {
      commitment: /** @type {const} */ ("finalized"),
      deadlineMs: 5000,
      pollMs: 5,
    };
    const node = startNode({ statuses: ["confirmed", "finalized"] });
    const { signed, deps } = await prepare(node, { ...SLOW, name: "final", confirmation });
    await Effect.runPromise(submitSigned(deps, { signed }, SKIP));
    expect(node.calls.filter((call) => call === "getSignatureStatuses")).toHaveLength(2);
  });
  test("a refused send the node cannot report on is may-have-landed, with its signature", async () => {
    const node = startNode({ failSend: true, statusResult: null });
    const { signed, deps } = await prepare(node);
    const started = Date.now();
    const error = await failureOf(submitSigned(deps, { signed }, SKIP));
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error).reason).toBe(MAY_HAVE_LANDED);
    expect(/** @type {TransactionFailed} */ (error).signature).toBeTruthy();
    expect(Date.now() - started).toBeLessThan(2000);
    expect(node.calls).toEqual(["getBlockHeight", "sendTransaction", "getSignatureStatuses"]);
  });

  test("a Submitter defect after the send still reports the signature", async () => {
    const node = startNode();
    const { signed, deps } = await prepare(node);
    const submitter = { ...deps.submitter, status: () => Effect.die(new Error("adapter bug")) };
    const error = await failureOf(submitSigned({ ...deps, submitter }, { signed }, SKIP));
    expect(error).toBeInstanceOf(TransactionFailed);
    expect(/** @type {TransactionFailed} */ (error).reason).toBe(MAY_HAVE_LANDED);
    expect(/** @type {TransactionFailed} */ (error).signature).toBeTruthy();
  });
});
