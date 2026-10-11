// @ts-check
import { describe, expect, test } from "bun:test";
import { PriceFeed } from "@solos/core";
import {
  MintDecimals,
  SpendMeter,
  actualUsdFor,
  reserveUsdFor,
  usdForLamports,
} from "@solos/core/strategy";
import { swapFeeReserveLamports } from "@solos/solana/swap/fee-reserve";
import { WSOL_MINT } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { transferNotionalUsd } from "./sol-notional.js";
import { liveSpendMeter } from "./tick-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const SOL_PRICE = "100";
const USDC_PRICE = "1";

/** @param {string} mint */
const priceFor = (mint) => (mint === WSOL_MINT ? SOL_PRICE : USDC_PRICE);

/** @param {string} mint */
const knownDecimals = (mint) => (mint === WSOL_MINT ? 9 : 6);

/**
 * @param {(mint: string) => void} [onRead]
 * @param {(mint: string) => number | undefined} [decimalsOf]
 */
const feed = (onRead, decimalsOf = knownDecimals) =>
  Layer.mergeAll(
    Layer.succeed(PriceFeed, {
      source: "test",
      getPrice: (mint) => {
        onRead?.(mint);
        return Effect.succeed({ mint, priceUsd: priceFor(mint), source: "test", at: 1 });
      },
    }),
    Layer.succeed(MintDecimals, {
      decimalsOf: (mint) => Effect.succeed(decimalsOf(mint)),
    }),
  );

/**
 * @param {import("@solos-sh/actions").Action} action
 * @param {(mint: string) => void} [onRead]
 * @param {(mint: string) => number | undefined} [decimalsOf]
 */
const quote = (action, onRead, decimalsOf) =>
  Effect.gen(function* () {
    return yield* (yield* SpendMeter).quote(action);
  }).pipe(Effect.provide(Layer.provide(liveSpendMeter, feed(onRead, decimalsOf))));

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
    const priced = { priceUsd: SOL_PRICE, decimals: 9, feeUsd };
    expect(quoted.actualUsd).toBe(actualUsdFor(action, priced));
    expect(quoted.reserveUsd).toBe(reserveUsdFor(action, priced));
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
    const priced = { priceUsd: USDC_PRICE, decimals: 6, feeUsd };
    expect(quoted.actualUsd).toBe(actualUsdFor(action, priced));
    expect(quoted.reserveUsd).toBe(reserveUsdFor(action, priced));
  });

  test("a transfer hold stays principal plus the transfer builder fee", async () => {
    const action = { type: /** @type {const} */ ("transfer_sol"), to: USDC, lamports: "10000000" };
    const quoted = await Effect.runPromise(quote(action));
    const notional = transferNotionalUsd(action.lamports, SOL_PRICE);
    expect(quoted.reserveUsd).toBe(notional);
    expect(quoted.actualUsd).toBe(notional);
    expect(quoted.solPriceUsd).toBeUndefined();
  });

  test("a 6-decimal non-USDC mint is priced at those decimals", async () => {
    const action = swap(USDT, "1000000");
    const quoted = await Effect.runPromise(quote(action));
    expect(quoted.actualUsd).toBe("1.00000000");
    expect(quoted.unverified).toBeUndefined();
  });

  test("unreadable decimals are not priced as 9", async () => {
    const action = swap(USDT, "1000000");
    const quoted = await Effect.runPromise(
      quote(action, undefined, (mint) => (mint === USDT ? undefined : knownDecimals(mint))),
    );
    expect(quoted.unverified).toBe(true);
    expect(quoted.actualUsd).toBe("0");
    expect(quoted.reserveUsd).toBe("0");
  });
});
