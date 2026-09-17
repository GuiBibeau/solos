// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const KEY = "test-jupiter-key";
const MINT = "So11111111111111111111111111111111111111112";
const PRICE = 100.46852810203305;

const solanaEnv = async () => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * Spawn `bun run solos ...` exactly as a human or agent would, with only the given env.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
const runSolos = async (args, env) => {
  const proc = Bun.spawn([process.execPath, "run", "solos", ...args], {
    cwd: ROOT,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
};

/**
 * `bun run` wraps the CLI's stderr with its own lines; pick the JSON line the CLI printed.
 * @param {string} stderr
 * @returns {any} the parsed CLI output, or undefined when stderr has no JSON line
 */
const stderrJson = (stderr) => {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("{"));
  return line === undefined ? undefined : JSON.parse(line);
};

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {{ requests: Array<{ key: string | undefined; ids: string | undefined }>; url: string; stop: () => void }} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      requests.push({
        key: request.headers.get("x-api-key") ?? undefined,
        ids: new URL(request.url).searchParams.get("ids") ?? undefined,
      });
      return Response.json({ [MINT]: { usdPrice: PRICE, blockId: 4815, decimals: 9 } });
    },
  });
  fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
});

afterAll(() => fixture?.stop());

describe("`solos market price` and `solos mcp` through real child processes [integration]", () => {
  test("market price prints the contract JSON and reaches the loopback fixture", async () => {
    const { stdout, code } = await runSolos(["market", "price", "--mint", MINT], {
      ...(await solanaEnv()),
      JUPITER_API_KEY: KEY,
      JUPITER_BASE_URL: fixture.url,
    });
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      mint: MINT,
      priceUsd: String(PRICE),
      source: "jupiter",
      at: expect.any(Number),
    });
    expect(fixture.requests).toEqual([{ key: KEY, ids: MINT }]);
  });

  test("mcp call returns the matching price through the real server child", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_get_price", "--args", JSON.stringify({ mint: MINT })],
      { ...(await solanaEnv()), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({
      mint: MINT,
      priceUsd: String(PRICE),
      source: "jupiter",
    });
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("mcp list without a key still advertises every tool, price included", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], await solanaEnv());
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toEqual([
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
  });

  test("market price without a key exits 1 with the tagged error, before provider access", async () => {
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(["market", "price", "--mint", MINT], {
      ...(await solanaEnv()),
      JUPITER_BASE_URL: fixture.url,
    });
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "PriceConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("mcp call without a parent key returns a structured tool error", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      ["mcp", "call", "solana_market_get_price", "--args", JSON.stringify({ mint: MINT })],
      { ...(await solanaEnv()), JUPITER_BASE_URL: fixture.url },
    );
    expect(code).not.toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toMatchObject({ code: "PriceConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });
});
