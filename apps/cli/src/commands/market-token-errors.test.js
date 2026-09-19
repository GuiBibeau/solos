// @ts-check
import { beforeAll, describe, expect, test } from "bun:test";
import { seedTokenFixtures } from "@solos/solana/market/test-seeds";
import {
  ensureSurfnet,
  randomSeed,
  seedToPrivateKeyString,
  USDC_MINT,
} from "@solos/solana/surfnet";
import { runSolos, stderrJson } from "./cli-fixture.js";

/** Synthetic credential: proves provider text and poisoned env never reach a client. */
const CREDENTIAL = "qa-synthetic-credential";

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {Awaited<ReturnType<typeof seedTokenFixtures>>} */
let fx;
/** @type {string | undefined} */
let signerKey;
/** @type {{ url: string; origin: string } | undefined} */
let leaky;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fx = await seedTokenFixtures(surfnet.rpcUrl, USDC_MINT);
  signerKey = await seedToPrivateKeyString(randomSeed());
  // A loopback JSON-RPC endpoint whose every answer echoes a synthetic credential in the
  // provider error message, on a URL that carries the credential in path and query.
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
  leaky = {
    url: `http://127.0.0.1:${server.port}/qa/${CREDENTIAL}?api-key=${CREDENTIAL}`,
    origin: `http://127.0.0.1:${server.port}`,
  };
});

describe("token read redaction through real child processes [integration]", () => {
  test("a provider error message carrying a credential never reaches the CLI output", async () => {
    const { stdout, stderr, code } = await runSolos(
      ["market", "token", "--mint", fx.classicWithMetaplex],
      {
        SOLANA_RPC_URL: /** @type {string} */ (leaky?.url),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderr).not.toContain(CREDENTIAL);
    const error = stderrJson(stderr)?.error;
    expect(error).toMatchObject({
      code: "RpcError",
      url: leaky?.origin,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(error)).not.toContain(CREDENTIAL);
  });

  test("the same leaky endpoint stays clean through the real MCP server", async () => {
    const { stdout, stderr, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_market_get_token",
        "--args",
        JSON.stringify({ mint: fx.classicWithMetaplex }),
      ],
      {
        SOLANA_RPC_URL: /** @type {string} */ (leaky?.url),
        SOLOS_SIGNER_PRIVATE_KEY: signerKey ?? "",
        SOLOS_LOG_LEVEL: "warn",
      },
    );
    expect(code).not.toBe(0);
    expect(stderr).not.toContain(CREDENTIAL);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({
      code: "RpcError",
      url: leaky?.origin,
      reason: "the configured RPC endpoint failed the request",
    });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
  });
});
