// @ts-check
import { describe, expect, test } from "bun:test";
import { createSolanaRpc, createSolanaRpcSubscriptions, getAddressDecoder } from "@solana/kit";
import { getCurve } from "@solos/core/launch";
import { Cause, Effect, Layer, Option } from "effect";
import { LaunchVenueLive } from "../index.js";
import { SolanaRpc } from "../rpc/solana-rpc.js";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { bondingCurveBytes, globalConfigBytes } from "./test-fixtures.js";

/**
 * Transport and Global-config failure paths over raw loopback JSON-RPC servers — no Surfnet,
 * no public endpoint. Fixture family: one good SOL-paired curve owned by the pinned pump
 * program, and a per-server Global behavior; failures come from the server shape itself.
 */

/** Synthetic credential used to prove provider failure text never reaches a client. */
const CREDENTIAL = "qa-synthetic-rpc-credential";

const CURVE_BYTES = bondingCurveBytes({
  virtualTokenReserves: 1_073_000_000_000_000n,
  virtualQuoteReserves: 30_000_000_000n,
  realTokenReserves: 793_100_000_000_000n,
  realQuoteReserves: 1_000_000_000n,
});
const SYSTEM_PROGRAM = "11111111111111111111111111111111";

/** A fresh, never-funded address. */
const randomMint = () => getAddressDecoder().decode(crypto.getRandomValues(new Uint8Array(32)));

/**
 * A JSON-RPC endpoint answering `getAccountInfo` from an address map.
 * @param {Map<string, { owner: string; data: Uint8Array } | null>} accounts
 */
const startRpcServer = (accounts) => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: async (request) => {
      const rpc = /** @type {{ id: number; params: [string, unknown] }} */ (await request.json());
      const account = accounts.get(rpc.params[0]) ?? null;
      const value =
        account === null
          ? null
          : {
              data: [Buffer.from(account.data).toString("base64"), "base64"],
              executable: false,
              lamports: 1_461_600,
              owner: account.owner,
              space: account.data.length,
            };
      return Response.json({
        jsonrpc: "2.0",
        id: rpc.id,
        result: { context: { slot: 1 }, value },
      });
    },
  });
  return { url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

/**
 * The standard fixture: the good curve at its PDA, the good Global at its PDA, everything
 * else absent. `globalAccount` swaps the Global behavior per scenario.
 * @param {string} mint
 * @param {{ owner: string; data: Uint8Array } | null} globalAccount
 */
const startCurveServer = async (mint, globalAccount) => {
  const accounts = new Map([
    [await bondingCurveAddress(mint), { owner: PUMP_PROGRAM, data: CURVE_BYTES }],
    [await globalConfigAddress(), globalAccount],
  ]);
  return startRpcServer(accounts);
};

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

/**
 * One read through the core use case and the live adapter against `url`.
 * @param {string} url
 * @param {string} mint
 * @param {number} timeoutMs
 */
const readAt = async (url, mint, timeoutMs = 5000) => {
  const layer = LaunchVenueLive({ timeoutMs }).pipe(
    Layer.provide(
      Layer.succeed(SolanaRpc, {
        url,
        rpc: createSolanaRpc(url),
        rpcSubscriptions: createSolanaRpcSubscriptions("ws://127.0.0.1:9"),
      }),
    ),
  );
  const exit = await Effect.runPromiseExit(getCurve({ mint }).pipe(Effect.provide(layer)));
  if (exit._tag === "Failure") {
    const failure = Cause.failureOption(exit.cause);
    if (Option.isNone(failure)) throw new Error(`expected a domain error: ${String(exit.cause)}`);
    return /** @type {object} */ (failure.value);
  }
  return exit.value;
};

describe("launch curve transport and Global-config failures [integration]", () => {
  test("a good curve and Global over raw JSON-RPC decode to the full LaunchCurve", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, {
      owner: PUMP_PROGRAM,
      data: globalConfigBytes(),
    });
    try {
      expect(await readAt(server.url, mint)).toEqual({
        mint,
        program: PUMP_PROGRAM,
        complete: false,
        progressBps: 0,
        virtualSolReserves: "30000000000",
        virtualTokenReserves: "1073000000000000",
      });
    } finally {
      server.stop();
    }
  });

  test("an absent Global config fails CurveConfigUnavailable, never a guessed constant", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, null);
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is absent",
      });
    } finally {
      server.stop();
    }
  });

  test("a Global shorter than the stable prefix fails CurveConfigUnavailable", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, {
      owner: PUMP_PROGRAM,
      data: globalConfigBytes({ bytes: 96 }),
    });
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is shorter than the stable layout prefix",
      });
    } finally {
      server.stop();
    }
  });

  test("a Global owned by another program fails CurveConfigUnavailable", async () => {
    const mint = randomMint();
    const server = await startCurveServer(mint, {
      owner: SYSTEM_PROGRAM,
      data: globalConfigBytes(),
    });
    try {
      expect(await readAt(server.url, mint)).toMatchObject({
        _tag: "CurveConfigUnavailable",
        reason: "Global config account is not owned by the pinned pump program",
      });
    } finally {
      server.stop();
    }
  });

  test("a provider error never becomes a reason: fixed text over the origin only", async () => {
    const server = startLeakyServer();
    try {
      const failure = /** @type {any} */ (await readAt(server.url, randomMint()));
      expect(failure).toMatchObject({
        _tag: "RpcError",
        method: "getAccountInfo",
        url: `http://127.0.0.1:${new URL(server.url).port}`,
        reason: "the configured RPC endpoint failed the request",
      });
      expect(JSON.stringify(failure)).not.toContain(CREDENTIAL);
    } finally {
      server.stop();
    }
  });

  test("a body that stalls past the deadline aborts with a clear tagged error", async () => {
    const server = startStallServer();
    try {
      const started = Date.now();
      const failure = /** @type {any} */ (await readAt(server.url, randomMint(), 250));
      expect(Date.now() - started).toBeLessThan(5000);
      expect(failure).toMatchObject({
        _tag: "RpcError",
        method: "getAccountInfo",
        url: `http://127.0.0.1:${new URL(server.url).port}`,
        reason: "no response within the 250ms request deadline",
      });
    } finally {
      server.stop();
    }
  });
});
