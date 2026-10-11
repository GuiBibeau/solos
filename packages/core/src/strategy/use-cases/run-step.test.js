// @ts-check
import { describe, expect, test } from "bun:test";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { addDecimal } from "../domain/decimal.js";
import { actualUsdFor, reserveUsdFor } from "../domain/notional.js";
import { usdForLamports } from "../domain/usd-for-lamports.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { runStep } from "./run-step.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const PRICE = "100";
const FEE_LAMPORTS = "105000";
const ACTION = {
  type: /** @type {const} */ ("swap"),
  inputMint: WSOL_MINT,
  outputMint: USDC,
  amount: "10000000",
  maxSlippageBps: 50,
};

/** @param {Record<string, unknown>} [patch] */
const bounds = (patch = {}) =>
  /** @type {import("@solos-sh/actions").StrategyBounds} */ ({
    maxNotionalPerTickUsd: "100",
    maxDailySpendUsd: "1000",
    allowedMints: [],
    expiresAt: null,
    maxConsecutiveFailures: 3,
    ...patch,
  });

/**
 * @param {import("../ports/spend-meter.js").SpendQuote} quote
 * @param {import("../ports/tick-submit.js").SubmitResult} sent
 * @param {import("@solos-sh/actions").StrategyBounds} [cap]
 */
const step = (quote, sent, cap = bounds()) =>
  runStep({
    strategyId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    tickId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    intentId: sent.intentId,
    action: ACTION,
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        memoryCapLedger({ boundsFor: () => cap }),
        scriptedSpendMeter(quote),
        Layer.sync(TickSubmit, () => ({
          submit: () => Effect.succeed(sent),
        })),
      ),
    ),
  );

describe("swap spend", () => {
  test("a confirmed swap settles the input notional plus the landed fee", async () => {
    const input = actualUsdFor(ACTION, PRICE);
    const feeUsd = usdForLamports(FEE_LAMPORTS, PRICE) ?? "0";
    const spend = addDecimal(input, feeUsd);
    const quote = {
      reserveUsd: input,
      actualUsd: input,
      mint: WSOL_MINT,
      solPriceUsd: PRICE,
    };
    const result = await Effect.runPromise(
      step(quote, {
        intentId: "swap.settle.0",
        state: "settled",
        signature: "sig",
        feeLamports: FEE_LAMPORTS,
      }),
    );
    expect(spend).toBe("1.01050000");
    expect(result.outcome).toBe("executed");
    expect(result.reason).toBe(`settled ${spend} USD is above the reserved hold of ${input} USD`);
  });

  test("the same spend stays inside a hold of slippage plus the built fee", async () => {
    const input = actualUsdFor(ACTION, PRICE);
    const feeUsd = usdForLamports(FEE_LAMPORTS, PRICE) ?? "0";
    const quote = {
      reserveUsd: reserveUsdFor(ACTION, PRICE, feeUsd),
      actualUsd: input,
      mint: WSOL_MINT,
      solPriceUsd: PRICE,
    };
    const result = await Effect.runPromise(
      step(quote, {
        intentId: "swap.hold.0",
        state: "settled",
        signature: "sig",
        feeLamports: FEE_LAMPORTS,
      }),
    );
    expect(result.outcome).toBe("executed");
    expect(result.reason).toBeUndefined();
  });

  test("a confirmed swap with no readable fee leaves the hold open", async () => {
    const quote = {
      reserveUsd: "1.01550000",
      actualUsd: "1.00000000",
      mint: WSOL_MINT,
      solPriceUsd: PRICE,
    };
    const result = await Effect.runPromise(
      step(quote, { intentId: "swap.open.0", state: "settled", signature: "sig" }),
    );
    expect(result.outcome).toBe("in_flight");
    expect(result.intent?.state).toBe("in_flight");
  });

  test("a landed swap failure settles only the fee", async () => {
    const feeUsd = usdForLamports(FEE_LAMPORTS, PRICE) ?? "0";
    const quote = {
      reserveUsd: feeUsd,
      actualUsd: actualUsdFor(ACTION, PRICE),
      mint: WSOL_MINT,
      solPriceUsd: PRICE,
    };
    const cap = bounds({ maxDailySpendUsd: feeUsd });
    const layer = Layer.mergeAll(
      memoryCapLedger({ boundsFor: () => cap }),
      scriptedSpendMeter(quote),
      Layer.sync(TickSubmit, () => ({
        submit: (input) =>
          Effect.succeed({
            intentId: input.intentId,
            state: /** @type {const} */ ("failed"),
            signature: "sig",
            feeLamports: FEE_LAMPORTS,
            reason: "execution failed",
            remedy: "inspect the signature",
          }),
      })),
    );
    const once = (intentId) =>
      runStep({
        strategyId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        tickId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
        intentId,
        action: ACTION,
      });
    const recorded = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* once("swap.fee.0");
        const second = yield* once("swap.fee.1");
        return { first, second };
      }).pipe(Effect.provide(layer)),
    );
    expect(recorded.first.outcome).toBe("failed");
    expect(recorded.second.outcome).toBe("skipped_bounds");
    expect(recorded.second.reason).toContain("daily spend cap");
  });
});
