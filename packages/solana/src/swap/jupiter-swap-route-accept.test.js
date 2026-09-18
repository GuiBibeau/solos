// @ts-check
import { afterEach, describe, expect, test } from "bun:test";
import {
  AMOUNT,
  INPUT_MINT,
  MIN_OUT_AMOUNT,
  OUT_AMOUNT,
  OUTPUT_MINT,
  okBody,
} from "./jupiter-swap-bodies.js";
import { quoteThrough, startFixture } from "./jupiter-swap-fixture.js";

/**
 * Acceptance of the standard route topologies: a sequential multihop with chained mints and
 * amounts, and a 50/50 split over two AMMs whose terminals jointly cover the output.
 */

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

describe("JupiterSwapLive route acceptance [integration]", () => {
  /** @type {ReturnType<typeof startFixture>} */
  let fixture;

  afterEach(() => {
    fixture?.stop();
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
});
