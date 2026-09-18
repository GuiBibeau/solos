// @ts-check
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ensureSurfnet } from "@solos/solana/surfnet";
import {
  AMOUNT,
  INPUT_MINT,
  KEY,
  OUTPUT_MINT,
  runSolos,
  solanaEnv,
  startSwapFixture,
} from "./swap-quote-fixture.js";

/**
 * Success and normalization scenarios: `solos swap quote` and `solos mcp call` print the full
 * SwapQuote JSON and reach the loopback fixture through real child processes.
 */

/** The validated strip-mode payload: documented fields only, extras and null taker dropped. */
const expectedRaw = () => ({
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  inAmount: AMOUNT,
  outAmount: "169900000000000000000000000000",
  otherAmountThreshold: "169050500000000000000000000000",
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
        outAmount: "169900000000000000000000000000",
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
  outAmount: "169900000000000000000000000000",
  minOutAmount: "169050500000000000000000000000",
  priceImpactPct: "0.01",
  routeSummary: ["Orca"],
  expiresAt: expect.any(Number),
  raw: expectedRaw(),
});

/** @type {Awaited<ReturnType<typeof ensureSurfnet>>} */
let surfnet;
/** @type {ReturnType<typeof startSwapFixture>} */
let fixture;

beforeAll(async () => {
  surfnet = await ensureSurfnet();
  fixture = startSwapFixture();
});

afterAll(() => fixture?.stop());

describe("`solos swap quote` success through real child processes [integration]", () => {
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
      { ...(await solanaEnv(surfnet)), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
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
      { ...(await solanaEnv(surfnet)), JUPITER_API_KEY: KEY, JUPITER_BASE_URL: fixture.url },
    );
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual(expectedQuote());
    expect(fixture.requests.length).toBe(before + 1);
  });
});
