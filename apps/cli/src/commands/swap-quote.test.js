// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import path from "node:path";
import { ensureSurfnet, randomSeed, seedToPrivateKeyString } from "@solos/solana/surfnet";

const ROOT = new URL("../../../..", import.meta.url).pathname;
const CLI_ENTRY = path.join(ROOT, "apps/cli/src/main.js");
const KEY = "test-jupiter-key";
const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AMOUNT = "1000000000000000000000000000000";
const OUT_AMOUNT = "169900000000000000000000000000";
const MIN_OUT_AMOUNT = "169050500000000000000000000000";

/** Quote-only Metis-routed body, reconstructed from the documented V2 envelope. */
const BODY = {
  mode: "manual",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: OUT_AMOUNT,
  otherAmountThreshold: MIN_OUT_AMOUNT,
  priceImpact: 1,
  priceImpactPct: "0.01",
  swapMode: "ExactIn",
  slippageBps: 50,
  router: "metis",
  swapType: "aggregator",
  routePlan: [
    {
      swapInfo: {
        ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
        label: "Orca",
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmount: AMOUNT,
        outAmount: OUT_AMOUNT,
      },
      percent: 100,
      bps: 10_000,
    },
  ],
  transaction: null,
  taker: null,
  guaranteedPrice: false,
  jitOptimized: false,
};

/** The validated strip-mode payload: documented fields only, extras and null taker dropped. */
const expectedRaw = () => ({
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: OUT_AMOUNT,
  otherAmountThreshold: MIN_OUT_AMOUNT,
  priceImpact: 1,
  swapMode: "ExactIn",
  slippageBps: 50,
  router: "metis",
  routePlan: [
    {
      swapInfo: {
        ammKey: "58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2",
        label: "Orca",
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        inAmount: AMOUNT,
        outAmount: OUT_AMOUNT,
      },
      percent: 100,
      bps: 10_000,
    },
  ],
  transaction: null,
});

const expectedQuote = () => ({
  provider: "jupiter",
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: OUT_AMOUNT,
  minOutAmount: MIN_OUT_AMOUNT,
  priceImpactPct: "0.01",
  routeSummary: ["Orca"],
  expiresAt: expect.any(Number),
  raw: expectedRaw(),
});

const solanaEnv = async () => ({
  SOLANA_RPC_URL: surfnet.rpcUrl,
  SOLANA_WS_URL: surfnet.wsUrl,
  SOLOS_SIGNER_PRIVATE_KEY: await seedToPrivateKeyString(randomSeed()),
  SOLOS_LOG_LEVEL: "warn",
});

/**
 * Spawn the CLI entry directly — `bun --no-env-file run apps/cli/src/main.js`. The flag must
 * govern the one process that loads env files: going through the `solos` package script would
 * start a second Bun without the flag, which loads `.env`/`.env.local` again.
 * @param {string[]} args
 * @param {Record<string, string>} env
 */
const runSolos = async (args, env) => {
  const proc = Bun.spawn([process.execPath, "--no-env-file", "run", CLI_ENTRY, ...args], {
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
/** @type {{ requests: Array<{ url: string; method: string; key: string | undefined; amount: string | null; excludeRouters: string | null; taker: string | null }>; url: string; stop: () => void }} */
let fixture;
/** @type {() => Response} */
let respond = () => Response.json(BODY);

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  const requests = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const params = new URL(request.url).searchParams;
      requests.push({
        url: request.url,
        method: request.method,
        key: request.headers.get("x-api-key") ?? undefined,
        amount: params.get("amount"),
        excludeRouters: params.get("excludeRouters"),
        taker: params.get("taker"),
      });
      return respond();
    },
  });
  fixture = { requests, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
});

afterAll(() => fixture?.stop());

describe("`solos swap quote` and `solos mcp` through real child processes [integration]", () => {
  test("swap quote prints the full SwapQuote JSON and reaches the loopback fixture", async () => {
    const { stdout, code } = await runSolos(
      [
        "swap",
        "quote",
        "--input-mint",
        INPUT_MINT,
        "--output-mint",
        OUTPUT_MINT,
        "--amount",
        AMOUNT,
      ],
      { ...(await solanaEnv()), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    expect(JSON.parse(stdout)).toEqual(expectedQuote());
    expect(fixture.requests).toHaveLength(1);
    const [request] = fixture.requests;
    expect(request.method).toBe("GET");
    expect(new URL(request.url).pathname).toBe("/swap/v2/order");
    expect(request.amount).toBe(AMOUNT);
    expect(request.excludeRouters).toBe("jupiterz,dflow,okx");
    expect(request.taker).toBeNull();
    expect(request.key).toBe(KEY);
    expect(request.url.includes(KEY)).toBe(false);
  });

  test("mcp call returns the matching quote through the real server child", async () => {
    const before = fixture.requests.length;
    const { stdout, code } = await runSolos(
      [
        "mcp",
        "call",
        "solana_swap_get_quote",
        "--args",
        JSON.stringify({ inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: AMOUNT }),
      ],
      { ...(await solanaEnv()), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(expectedQuote());
    expect(fixture.requests.length).toBe(before + 1);
  });

  test("mcp list without a key still advertises every tool, the swap quote included", async () => {
    const { stdout, code } = await runSolos(["mcp", "list"], await solanaEnv());
    expect(code).toBe(0);
    const names = JSON.parse(stdout).tools.map((/** @type {{ name: string }} */ t) => t.name);
    expect(names).toEqual([
      "solana_market_ask_iris",
      "solana_market_get_event_summary",
      "solana_market_get_price",
      "solana_market_get_token",
      "solana_market_get_token_news",
      "solana_market_get_trending_tokens",
      "solana_swap_get_quote",
      "solana_transfer_send_sol",
      "solana_transfer_simulate_sol",
      "solana_wallet_get_address",
      "solana_wallet_get_balance",
    ]);
  });

  test("swap quote without a key exits 1 with the tagged error, before provider access", async () => {
    const before = fixture.requests.length;
    const { stdout, stderr, code } = await runSolos(
      [
        "swap",
        "quote",
        "--input-mint",
        INPUT_MINT,
        "--output-mint",
        OUTPUT_MINT,
        "--amount",
        AMOUNT,
      ],
      { ...(await solanaEnv()), JUPITER_BASE_URL: fixture.url },
    );
    expect(code).not.toBe(0);
    expect(stdout).toBe("");
    expect(stderrJson(stderr)?.error).toMatchObject({ code: "QuoteConfigMissing" });
    expect(fixture.requests.length).toBe(before);
  });

  test("an echo-mismatching provider answer exits 1 with QuoteResponseInvalid", async () => {
    const before = fixture.requests.length;
    respond = () => Response.json({ ...BODY, inAmount: "999" });
    try {
      const { stdout, stderr, code } = await runSolos(
        [
          "swap",
          "quote",
          "--input-mint",
          INPUT_MINT,
          "--output-mint",
          OUTPUT_MINT,
          "--amount",
          AMOUNT,
        ],
        { ...(await solanaEnv()), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
      );
      expect(code).not.toBe(0);
      expect(stdout).toBe("");
      expect(stderrJson(stderr)?.error).toMatchObject({ code: "QuoteResponseInvalid" });
    } finally {
      respond = () => Response.json(BODY);
    }
    expect(fixture.requests.length).toBe(before + 1);
  });
});
