// @ts-check
import { afterAll, describe, expect, test } from "bun:test";
import { startRpcRecorder } from "./rpc-recorder.js";

/** Two overridden methods with different latencies, so responses return out of request order. */
const recorder = startRpcRecorder("http://127.0.0.1:1", {
  slow: async () => {
    await new Promise((resolve) => setTimeout(resolve, 120));
    return "slow-result";
  },
  fast: () => "fast-result",
});

afterAll(() => recorder.stop());

/** @param {unknown} id @param {string} method */
const call = (id, method) =>
  fetch(recorder.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params: [] }),
  }).then((r) => r.json());

describe("rpc recorder pairs responses with their requests [integration]", () => {
  test("out-of-order responses land on the call that carries their id", async () => {
    const [slow, fast] = await Promise.all([call(1, "slow"), call(2, "fast")]);
    expect(slow.result).toBe("slow-result");
    expect(fast.result).toBe("fast-result");
    expect(recorder.callsFor("slow")[0]?.result).toBe("slow-result");
    expect(recorder.callsFor("fast")[0]?.result).toBe("fast-result");
  });
});
