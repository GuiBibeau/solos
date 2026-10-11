// @ts-check
import { describe, expect, test } from "bun:test";
import { PriceFeed } from "@solos/core";
import { SpendMeter, actualUsdFor, reserveUsdFor, usdForLamports } from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";
import { liveSpendMeter } from "./tick-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_PRICE = "100";
const USDC_PRICE = "1";

/** @param {string} mint */
const priceFor = (mint) => (mint === WSOL_MINT ? SOL_PRICE : USDC_PRICE);

/**
 * @param {(mint: string) => void} [onRead]
 */
const feed = (onRead) =>
  Layer.succeed(PriceFeed, {
    source: "test",
    getPrice: (mint) => {
      onRead?.(mint);
      return Effect.succeed({ mint, priceUsd: priceFor(mint), source: "test", at: 1 });
    },
  });

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {(mint: string) => void} [onRead]
 */
const quote = (action, onRead) =>
  Effect.gen(function* () {
    return yield* (yield* SpendMeter).quote(action);
  }).pipe(Effect.provide(Layer.provide(liveSpendMeter, feed(onRead))));

/** @param {string} inputMint @param {string} amount */
const swap = (inputMint, amount) => ({
  type: /** @type {const} */ ("swap"),
  inputMint,
  outputMint: inputMint === WSOL_MINT ? USDC : WSOL_MINT,
  amount,
  maxSlippageBps: 50,
});

describe("live swap quote", () => {
  test("a SOL swap hold is slippage plus the built fee at the one SOL read", async () => {
    /** @type {string[]} */
    const reads = [];
    const action = swap(WSOL_MINT, "10000000");
    const quoted = await Effect.runPromise(
      quote(action, (mint) => {
        reads.push(mint);
      }),
    );
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), SOL_PRICE) ?? "0";
    expect(reads).toEqual([WSOL_MINT]);
    expect(quoted.solPriceUsd).toBe(SOL_PRICE);
    expect(quoted.actualUsd).toBe(actualUsdFor(action, SOL_PRICE));
    expect(quoted.reserveUsd).toBe(reserveUsdFor(action, SOL_PRICE, feeUsd));
  });

  test("a non-SOL swap prices the fee with a second SOL read", async () => {
    /** @type {string[]} */
    const reads = [];
    const action = swap(USDC, "1000000");
    const quoted = await Effect.runPromise(
      quote(action, (mint) => {
        reads.push(mint);
      }),
    );
    const feeUsd = usdForLamports(swapFeeReserveLamports().toString(), SOL_PRICE) ?? "0";
    expect(reads).toEqual([USDC, WSOL_MINT]);
    expect(quoted.solPriceUsd).toBe(SOL_PRICE);
    expect(quoted.actualUsd).toBe(actualUsdFor(action, USDC_PRICE));
    expect(quoted.reserveUsd).toBe(reserveUsdFor(action, USDC_PRICE, feeUsd));
  });

  test("a transfer hold stays principal plus the transfer builder fee", async () => {
    const action = { type: /** @type {const} */ ("transfer_sol"), to: USDC, lamports: "10000000" };
    const quoted = await Effect.runPromise(quote(action));
    const notional = transferNotionalUsd(action.lamports, SOL_PRICE);
    expect(quoted.reserveUsd).toBe(notional);
    expect(quoted.actualUsd).toBe(notional);
    expect(quoted.solPriceUsd).toBeUndefined();
  });
});
