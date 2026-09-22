// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "@solos/solana/swap/build-bodies";
import { startBuildFixture } from "@solos/solana/swap/build-http-fixture";
import { runSolos, stderrJson } from "./swap-quote-fixture.js";

const SECRET = "qa-synthetic-swap-rpc-secret";
const REQUEST_FAILED = "the configured RPC endpoint failed the request";
const MAY_HAVE_LANDED =
  "confirmation was not established before the deadline; the transaction may still have landed";
/** The fixture mints exist on chain under the classic token program; the fresh wSOL ATA does
 * not, which the preflight cleanup check relies on. */
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const args = ["--input-mint", INPUT_MINT, "--output-mint", OUTPUT_MINT, "--amount", AMOUNT];
/** @type {"lifetime" | "simulation" | "send"} */
let stage = "lifetime";
/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;
/** @type {ReturnType<typeof Bun.serve>} */
let rpc;

/** @param {{ method: string; params: Array<unknown> }} payload */
const resultFor = (payload) => {
  if (payload.method === "getAccountInfo") {
    const mint = payload.params[0];
    if (mint !== INPUT_MINT && mint !== OUTPUT_MINT) {
      return { context: { slot: 1 }, value: null };
    }
    return {
      context: { slot: 1 },
      value: {
        data: ["", "base64"],
        executable: false,
        lamports: 1_461_600,
        owner: TOKEN_PROGRAM,
        rentEpoch: 0,
        space: 82,
      },
    };
  }
  if (payload.method === "getLatestBlockhash") {
    return {
      context: { slot: 1 },
      value: { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 200 },
    };
  }
  if (payload.method === "getBlockHeight") return 1;
  if (payload.method === "simulateTransaction") {
    return { context: { slot: 1 }, value: { err: null, logs: [], unitsConsumed: 1 } };
  }
  return null;
};

/** @param {string} method */
const isFailureStage = (method) =>
  (stage === "lifetime" && method === "getLatestBlockhash") ||
  (stage === "simulation" && method === "simulateTransaction") ||
  (stage === "send" && method === "sendTransaction");

beforeAll(() => {
  fixture = startBuildFixture();
  rpc = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const body = /** @type {{ id: unknown; method: string; params: Array<unknown> }} */ (
        await request.json()
      );
      if (isFailureStage(body.method)) {
        return Response.json({
          jsonrpc: "2.0",
          id: body.id,
          error: { code: -32_603, message: `provider echoed ${SECRET}` },
        });
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result: resultFor(body) });
    },
  });
});

afterAll(() => {
  fixture?.stop();
  rpc?.stop(true);
});

const childEnv = async () => ({
  SOLANA_RPC_URL: `http://127.0.0.1:${rpc.port}/v1/${SECRET}?api-key=${SECRET}`,
  SOLANA_WS_URL: "ws://127.0.0.1:1",
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
  JUPITER_API_KEY: KEY,
  JUPITER_BASE_URL: fixture.url,
});

/** @param {unknown} error @param {string} expected */
const expectRedacted = (error, expected) => {
  const serialized = JSON.stringify(error);
  expect(serialized).not.toContain(SECRET);
  expect(error).toMatchObject({ code: expected });
  if (expected === "RpcError") {
    expect(error).toMatchObject({ url: `http://127.0.0.1:${rpc.port}`, reason: REQUEST_FAILED });
  } else {
    expect(error).toMatchObject({ reason: MAY_HAVE_LANDED });
  }
};

const cases = /** @type {const} */ ([
  ["lifetime", "RpcError"],
  ["simulation", "RpcError"],
  ["send", "TransactionFailed"],
]);

describe("swap RPC redaction through real child processes [integration]", () => {
  // Slow multi-child test: an explicit 60s budget, matching the repo-wide `bun test --timeout`.
  test("native CLI redacts lifetime, simulation, and send provider failures", {
    timeout: 60_000,
  }, async () => {
    for (const [failureStage, tag] of cases) {
      stage = failureStage;
      const { stderr, code } = await runSolos(["swap", "execute", ...args], await childEnv());
      expect(code).toBe(1);
      expect(stderr).not.toContain(SECRET);
      expectRedacted(stderrJson(stderr)?.error, tag);
    }
  });

  test("real stdio MCP redacts lifetime, simulation, and send provider failures", {
    timeout: 60_000,
  }, async () => {
    const toolArgs = JSON.stringify({
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      amount: AMOUNT,
    });
    for (const [failureStage, tag] of cases) {
      stage = failureStage;
      const result = await runSolos(
        ["mcp", "call", "solana_swap_execute_swap", "--args", toolArgs],
        await childEnv(),
      );
      expect(result.code).toBe(1);
      expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
      expectRedacted(JSON.parse(result.stdout).structuredContent, tag);
    }
  });
});
