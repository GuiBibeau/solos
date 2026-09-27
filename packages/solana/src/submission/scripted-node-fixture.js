// @ts-check
/**
 * Test fixture: a scripted JSON-RPC node behind the real HTTP RPC adapter, and the Submission
 * deps that seal a real v1 transfer draft against it. Every method the node is asked is
 * recorded in order, so a test can pin the exact call sequence Submission makes.
 */
import { createMemorySignerFromBytes } from "@solana/keychain-memory";
import { createSolanaRpc, createSolanaRpcSubscriptions } from "@solana/kit";
import { Effect } from "effect";
import { transferDraft } from "../executor/transfer-sol.js";
import { randomSeed } from "../surfnet/test-surfnet.js";
import { SLOW } from "./mode.js";
import { rpcSubmitter } from "./submitter.js";

export const LAST_VALID = 200;
/** The two reads sealing makes before it signs, when the mode rechecks. */
export const SEAL = /** @type {const} */ (["getLatestBlockhash", "getBlockHeight"]);
export const ALWAYS = { skipSimulation: false };
export const SKIP = { skipSimulation: true };

/** @type {Array<() => void>} */
const stops = [];
/** Stop every node started since the last call; run it in `afterEach`. */
export const stopNodes = () => {
  for (const stop of stops.splice(0)) stop();
};

/** @param {string[]} calls @param {string} label */
export const mark = (calls, label) => Effect.sync(() => void calls.push(label));

/**
 * @param {{ heights?: number[]; simErr?: unknown; statuses?: string[]; statusResult?: unknown }} script
 */
const resultsFor = (script) => {
  const heights = [...(script.heights ?? [])];
  const statuses = [...(script.statuses ?? ["confirmed"])];
  const status = () => ({
    context: { slot: 1 },
    value: [
      {
        slot: 1,
        confirmations: 0,
        err: null,
        confirmationStatus: statuses.shift() ?? "confirmed",
      },
    ],
  });
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
    getSignatureStatuses: () => ("statusResult" in script ? script.statusResult : status()),
  };
  return results;
};

/**
 * A scripted node. Heights and statuses are consumed one per call, then default to live and
 * confirmed. `failSend` refuses every send; `statusResult` replaces the whole status response,
 * malformed on purpose when asked.
 * @param {{ heights?: number[]; simErr?: unknown; statuses?: string[]; failSend?: boolean; statusResult?: unknown }} [script]
 */
export const startNode = (script = {}) => {
  /** @type {string[]} */
  const calls = [];
  /** @type {unknown[][]} */
  const params = [];
  const results = resultsFor(script);
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
 * One real v1 transfer as a draft, and the Submission deps that seal it against the node.
 * @param {ReturnType<typeof startNode>} node
 * @param {import("./mode.js").SubmissionMode} [mode]
 * @param {import("../signer/kit-signer.js").KitSignerShape} [kit] a signer other than a fresh one
 */
export const prepare = async (node, mode = SLOW, kit) => {
  const signer = kit?.signer ?? (await createMemorySignerFromBytes(randomSeed()));
  const signing = kit ?? { backend: "memory", signer };
  const draft = transferDraft(signing, {
    type: "transfer_sol",
    to: signer.address,
    lamports: "1000",
  });
  const deps = { ctx: node.ctx, kit: signing, submitter: rpcSubmitter(node.ctx), mode };
  return { draft, deps };
};
