// @ts-check
import { afterAll, describe, expect, test } from "bun:test";
import { createSolanaRpc, createSolanaRpcSubscriptions, getAddressDecoder } from "@solana/kit";
import { getToken } from "@solos/core";
import { Cause, Effect, Layer, Option } from "effect";
import { SolanaRpc, TokenRegistryLive } from "../index.js";
import { TOKEN_PROGRAM } from "./mint-account.js";
import { classicMintBytes } from "./test-fixtures.js";

/** Synthetic credential used to prove provider failure text never reaches a client. */
const CREDENTIAL = "qa-synthetic-credential";

/** A fresh, never-funded address. */
const randomMint = () => getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

/**
 * A JSON-RPC endpoint whose every answer is a provider error whose message echoes a synthetic
 * credential, on a URL that itself carries the credential in path and query.
 */
const startLeakyServer = () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32_603,
          message: `internal quota failure for key ${CREDENTIAL} (endpoint ${CREDENTIAL})`,
        },
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

/**
 * An endpoint serving one real classic mint; every other account (the metadata PDA) is null.
 * @param {string} mint
 */
const startMintServer = (mint) => {
  const body = Buffer.from(classicMintBytes({ decimals: 6 })).toString("base64");
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string, unknown] }} */ (await request.json());
      const value =
        rpc.params[0] === mint
          ? {
              data: [body, "base64"],
              executable: false,
              lamports: 1_461_600,
              owner: TOKEN_PROGRAM,
              space: 82,
            }
          : null;
      return Response.json({ jsonrpc: "2.0", id: rpc.id, result: { context: { slot: 1 }, value } });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, mint, stop: () => server.stop(true) };
};

/**
 * The token registry over the shared `SolanaRpc` service, pointed at a loopback fixture with a
 * short, injectable deadline.
 * @param {string} url @param {number} timeoutMs
 */
const layerFor = (url, timeoutMs) =>
  TokenRegistryLive({ timeoutMs }).pipe(
    Layer.provide(
      Layer.succeed(SolanaRpc, {
        url,
        rpc: createSolanaRpc(url),
        rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
      }),
    ),
  );

/**
 * The tagged domain error a token read fails with.
 * @param {string} url @param {number} timeoutMs @param {string} mint
 */
const readFailure = async (url, timeoutMs, mint) => {
  const exit = await Effect.runPromiseExit(
    getToken({ mint }).pipe(Effect.provide(layerFor(url, timeoutMs))),
  );
  if (exit._tag !== "Failure") throw new Error("expected the read to fail");
  const failure = Cause.failureOption(exit.cause);
  if (Option.isNone(failure)) throw new Error(`expected a domain error: ${String(exit.cause)}`);
  return /** @type {object} */ (failure.value);
};

const fixtures = {
  leaky: startLeakyServer(),
  stall: startStallServer(),
  mint: startMintServer(randomMint()),
};

afterAll(() => {
  for (const fixture of Object.values(fixtures)) fixture.stop();
});

describe("token registry transport bounds and redaction [integration]", () => {
  test("a provider error message never becomes a reason: fixed text over the origin only", async () => {
    const failure = await readFailure(fixtures.leaky.url, 5000, randomMint());
    expect(failure).toMatchObject({
      _tag: "RpcError",
      method: "getAccountInfo",
      url: `http://127.0.0.1:${new URL(fixtures.leaky.url).port}`,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(failure)).not.toContain(CREDENTIAL);
  });

  test("a body that stalls past the deadline aborts with a clear tagged error", async () => {
    const started = Date.now();
    const failure = await readFailure(fixtures.stall.url, 250, randomMint());
    expect(Date.now() - started).toBeLessThan(5000);
    expect(failure).toMatchObject({
      _tag: "RpcError",
      method: "getAccountInfo",
      url: `http://127.0.0.1:${new URL(fixtures.stall.url).port}`,
      reason: "no response within the 250ms request deadline",
    });
  });

  test("the same bounded read still delivers accounts: a decoded mint reaches the metadata step", async () => {
    const seeded = await readFailure(fixtures.mint.url, 5000, fixtures.mint.mint);
    // The mint decoded (past every layout guard), its metadata PDA is absent, and the mint is
    // not canonical: the distinct metadata-unavailable failure, never an invented ticker.
    expect(seeded).toMatchObject({
      _tag: "TokenMetadataUnavailable",
      reason: "mint carries no metadata account and has no canonical mapping",
    });
    const missing = await readFailure(fixtures.mint.url, 5000, randomMint());
    expect(missing).toMatchObject({ _tag: "UnknownToken" });
  });
});
