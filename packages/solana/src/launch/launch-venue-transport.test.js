// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readAt, randomMint } from "./rpc-fixture.js";

/**
 * Transport bounds and redaction for the launch-curve read, over raw loopback JSON-RPC
 * servers: a provider's own failure text never becomes a reason, and a stalled body hits the
 * aborting deadline instead of hanging.
 */

/** Synthetic credential used to prove provider failure text never reaches a client. */
const CREDENTIAL = "qa-synthetic-rpc-credential";

/** A JSON-RPC endpoint whose every answer is a provider error echoing a synthetic credential, on a URL that carries it in path and query. */
const startLeakyServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32_603, message: `internal quota failure for key ${CREDENTIAL}` },
      }),
  });
  return {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    stop: () => server.stop(true),
  };
};

/** An endpoint that always sends response headers and then never finishes the body. */
const startStallServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      new Response(new ReadableStream({ start() {} }), {
        headers: { "content-type": "application/json" },
      }),
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/** @type {ReturnType<typeof startLeakyServer>} */
let leaky;
/** @type {ReturnType<typeof startStallServer>} */
let stall;

beforeAll(() => {
  leaky = startLeakyServer();
  stall = startStallServer();
});

afterAll(() => {
  leaky.stop();
  stall.stop();
});

describe("launch curve transport bounds and redaction [integration]", () => {
  test("a provider error never becomes a reason: fixed text over the origin only", async () => {
    const failure = /** @type {any} */ (await readAt(leaky.url, randomMint()));
    expect(failure).toMatchObject({
      _tag: "RpcError",
      method: "getAccountInfo",
      url: `http://127.0.0.1:${new URL(leaky.url).port}`,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(failure)).not.toContain(CREDENTIAL);
  });

  test("a body that stalls past the deadline aborts with a clear tagged error", async () => {
    const started = Date.now();
    const failure = /** @type {any} */ (await readAt(stall.url, randomMint(), 250));
    expect(Date.now() - started).toBeLessThan(5000);
    expect(failure).toMatchObject({
      _tag: "RpcError",
      method: "getAccountInfo",
      url: `http://127.0.0.1:${new URL(stall.url).port}`,
      reason: "no response within the 250ms request deadline",
    });
  });
});
