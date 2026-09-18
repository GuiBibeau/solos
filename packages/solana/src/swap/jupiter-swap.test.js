// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  AMOUNT,
  INPUT_MINT,
  KEY,
  MIN_OUT_AMOUNT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
  quoteFailure,
  quoteThrough,
  startFixture,
} from "./jupiter-swap-fixture.js";
import { QUOTE_TTL_MS } from "./jupiter-swap-quote.js";

/** Exact worst-case threshold at a tolerance, the same BigInt floor the validator assumes. */
const thresholdFor = (outAmount, slippageBps) =>
  ((BigInt(outAmount) * BigInt(10_000 - slippageBps)) / 10_000n).toString();

const INTERMEDIATE = "84525250000000000000000000000";
const FINAL_MINT = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const FINAL_OUT = "123456789000000";
const HALF = (BigInt(AMOUNT) / 2n).toString();
/** Each split branch's terminal gross: two of these cover the claimed net output exactly. */
const SPLIT_OUT = (BigInt(OUT_AMOUNT) / 2n).toString();

/** Sequential two-hop route wSOL -> USDC -> FINAL, each hop passing the full 10000 bps. */
const multihopBody = () =>
  okBody({
    outputMint: FINAL_MINT,
    outAmount: FINAL_OUT,
    otherAmountThreshold: thresholdFor(FINAL_OUT, 50),
    routePlan: [
      {
        swapInfo: {
          ammKey: "amm-orca",
          label: "Orca",
          inputMint: INPUT_MINT,
          outputMint: OUTPUT_MINT,
          inAmount: AMOUNT,
          outAmount: INTERMEDIATE,
        },
        percent: 100,
        bps: 10_000,
      },
      {
        swapInfo: {
          ammKey: "amm-phoenix",
          label: "Phoenix",
          inputMint: OUTPUT_MINT,
          outputMint: FINAL_MINT,
          inAmount: INTERMEDIATE,
          outAmount: FINAL_OUT,
        },
        percent: 100,
        bps: 10_000,
      },
    ],
  });

/** 50/50 split route over two AMMs, both branches wSOL -> USDC. */
const splitBody = () =>
  okBody({
    routePlan: [
      {
        swapInfo: {
          ammKey: "amm-orca",
          label: "Orca",
          inputMint: INPUT_MINT,
          outputMint: OUTPUT_MINT,
          inAmount: HALF,
          outAmount: SPLIT_OUT,
        },
        percent: 50,
        bps: 5000,
      },
      {
        swapInfo: {
          ammKey: "amm-raydium",
          label: "Raydium",
          inputMint: INPUT_MINT,
          outputMint: OUTPUT_MINT,
          inAmount: HALF,
          outAmount: SPLIT_OUT,
        },
        percent: 50,
        bps: 5000,
      },
    ],
  });

describe("JupiterSwapLive quote success [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
  });

  test("sends exactly one documented quote-only GET pinned to Metis, key in the header only", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests).toHaveLength(1);
    const [request] = fixture.requests;
    expect(request.method).toBe("GET");
    const url = new URL(request.url);
    expect(url.pathname).toBe("/swap/v2/order");
    expect(url.searchParams.get("inputMint")).toBe(INPUT_MINT);
    expect(url.searchParams.get("outputMint")).toBe(OUTPUT_MINT);
    expect(url.searchParams.get("amount")).toBe(AMOUNT);
    expect(url.searchParams.get("slippageBps")).toBe("50");
    expect(url.searchParams.get("swapMode")).toBe("ExactIn");
    expect(url.searchParams.get("excludeRouters")).toBe("jupiterz,dflow,okx");
    expect(request.taker).toBeNull();
    expect(request.key).toBe(KEY);
    expect(request.url.includes(KEY)).toBe(false);
    expect(quote.inputMint).toBe(INPUT_MINT);
  });

  test("makes no submit call: every recorded request is a GET", async () => {
    fixture = startFixture([{ body: okBody() }]);
    await quoteThrough(fixture);
    expect(fixture.requests.every((request) => request.method === "GET")).toBe(true);
  });

  test("follows a redirect that stays on the same origin and sends the key there", async () => {
    fixture = startFixture([{ status: 302, location: "/moved" }, { body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests).toHaveLength(2);
    expect(new URL(fixture.requests[1].url).pathname).toBe("/moved");
    expect(fixture.requests[1].key).toBe(KEY);
    expect(quote.inAmount).toBe(AMOUNT);
  });

  test("normalizes the V2 envelope onto the SwapQuote contract", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.provider).toBe("jupiter");
    expect(quote.inputMint).toBe(INPUT_MINT);
    expect(quote.outputMint).toBe(OUTPUT_MINT);
    expect(quote.inAmount).toBe(AMOUNT);
    expect(quote.outAmount).toBe(OUT_AMOUNT);
    expect(quote.minOutAmount).toBe(MIN_OUT_AMOUNT);
    expect(quote.priceImpactPct).toBe("0.01");
    expect(quote.routeSummary).toEqual(["Orca"]);
  });

  test("one priceImpact percentage point normalizes to the legacy decimal ratio 0.01", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.priceImpactPct).toBe(String(1 / 100));
    expect(quote.priceImpactPct).toBe("0.01");
  });

  test("the live-probed percentage-point value reproduces the provider's own ratio string", async () => {
    const priceImpact = -0.023645774568875608;
    fixture = startFixture([
      { body: okBody({ priceImpact, priceImpactPct: String(priceImpact / 100) }) },
    ]);
    const quote = await quoteThrough(fixture);
    expect(quote.priceImpactPct).toBe("-0.00023645774568875608");
  });

  test("expiresAt is the local receipt time plus the documented 30-second local TTL", async () => {
    expect(QUOTE_TTL_MS).toBe(30_000);
    fixture = startFixture([{ body: okBody() }]);
    const before = Date.now();
    const quote = await quoteThrough(fixture);
    expect(quote.expiresAt).toBeGreaterThanOrEqual(before + QUOTE_TTL_MS);
    expect(quote.expiresAt).toBeLessThanOrEqual(Date.now() + QUOTE_TTL_MS);
  });

  test("raw is the validated provider payload, non-executable with the route retained", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.raw).toMatchObject({
      inputMint: INPUT_MINT,
      outputMint: OUTPUT_MINT,
      inAmount: AMOUNT,
      outAmount: OUT_AMOUNT,
      otherAmountThreshold: MIN_OUT_AMOUNT,
      swapMode: "ExactIn",
      router: "metis",
      transaction: null,
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
    });
    const rendered = JSON.stringify(quote.raw);
    // Undocumented extras are tolerated on the wire but stripped from the validated payload.
    expect(rendered.includes("guaranteedPrice")).toBe(false);
    expect(rendered.includes("jitOptimized")).toBe(false);
  });

  test("echoes 30+ digit base-unit amounts exactly, request and quote alike", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const quote = await quoteThrough(fixture);
    expect(fixture.requests[0].amount).toBe(AMOUNT);
    expect(quote.inAmount).toBe(AMOUNT);
    expect(AMOUNT.length).toBeGreaterThan(30);
  });

  test("accepts a valid sequential multihop route with chained mints and amounts", async () => {
    fixture = startFixture([{ body: multihopBody() }]);
    const quote = await quoteThrough(
      fixture,
      {},
      { inputMint: INPUT_MINT, outputMint: FINAL_MINT, amount: AMOUNT, slippageBps: 50 },
    );
    expect(quote.outputMint).toBe(FINAL_MINT);
    expect(quote.outAmount).toBe(FINAL_OUT);
    expect(quote.routeSummary).toEqual(["Orca", "Phoenix"]);
  });

  test("accepts a valid 50/50 split route whose terminals cover the output", async () => {
    fixture = startFixture([{ body: splitBody() }]);
    const quote = await quoteThrough(fixture);
    expect(quote.routeSummary).toEqual(["Orca", "Raydium"]);
    expect(quote.inAmount).toBe(AMOUNT);
    expect(quote.minOutAmount).toBe(MIN_OUT_AMOUNT);
  });

  test("rejects an invalid mint, a zero amount, and identical mints before any HTTP", async () => {
    fixture = startFixture([{ body: okBody() }]);
    const invalid = { inputMint: "not-a-mint", outputMint: OUTPUT_MINT, amount: AMOUNT };
    expect((await quoteFailure(fixture, {}, invalid))?._tag).toBe("QuoteInputInvalid");
    const zero = { inputMint: INPUT_MINT, outputMint: OUTPUT_MINT, amount: "0" };
    expect((await quoteFailure(fixture, {}, zero))?._tag).toBe("QuoteInputInvalid");
    const same = { inputMint: INPUT_MINT, outputMint: INPUT_MINT, amount: AMOUNT };
    expect((await quoteFailure(fixture, {}, same))?._tag).toBe("QuoteInputInvalid");
    expect(fixture.requests).toHaveLength(0);
  });

  test("fails pre-HTTP without a key, blank keys included", async () => {
    fixture = startFixture([{ body: okBody() }]);
    expect((await quoteFailure(fixture, { apiKey: "" }))?._tag).toBe("QuoteConfigMissing");
    expect((await quoteFailure(fixture, { apiKey: " ".repeat(3) }))?._tag).toBe(
      "QuoteConfigMissing",
    );
    expect(fixture.requests).toHaveLength(0);
  });
});
