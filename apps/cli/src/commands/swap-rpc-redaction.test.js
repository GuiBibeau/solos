// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";
import { AMOUNT, INPUT_MINT, KEY, OUTPUT_MINT } from "@solos/solana/swap/build-bodies";
import { startBuildFixture } from "@solos/solana/swap/build-http-fixture";
import { runSolos, stderrJson } from "./swap-quote-fixture.js";

const SECRET = "qa-synthetic-swap-rpc-secret";
const RPC_REQUEST_FAILED = "the configured RPC endpoint failed the request";
const args = ["--input-mint", INPUT_MINT, "--output-mint", OUTPUT_MINT, "--amount", AMOUNT];

/** @type {ReturnType<typeof startBuildFixture>} */
let fixture;
/** @type {ReturnType<typeof Bun.serve>} */
let rpc;

beforeAll(() => {
  fixture = startBuildFixture();
  rpc = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32_603, message: `provider echoed ${SECRET}` },
      }),
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

describe("swap RPC redaction through real child processes [integration]", () => {
  test("native CLI omits endpoint credentials and provider text", async () => {
    const { stderr, code } = await runSolos(
      ["swap", "execute", ...args, "--skip-simulation"],
      await childEnv(),
    );
    expect(code).toBe(1);
    expect(stderr).not.toContain(SECRET);
    expect(stderrJson(stderr)?.error).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${rpc.port}`,
      reason: RPC_REQUEST_FAILED,
    });
  });

  test("real stdio MCP omits endpoint credentials and provider text", async () => {
    const toolArgs = JSON.stringify({
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      amount: AMOUNT,
      skipSimulation: true,
    });
    const { stdout, stderr, code } = await runSolos(
      ["mcp", "call", "solana_swap_execute_swap", "--args", toolArgs],
      await childEnv(),
    );
    expect(code).toBe(1);
    expect(`${stdout}${stderr}`).not.toContain(SECRET);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "RpcError",
      url: `http://127.0.0.1:${rpc.port}`,
      reason: RPC_REQUEST_FAILED,
    });
  });
});
