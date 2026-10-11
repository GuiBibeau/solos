// @ts-check
import { describe, expect, test } from "bun:test";
import { Effect, Layer } from "effect";
import { MintDecimalsUnverified } from "../domain/errors.js";
import { CapLedger } from "../ports/cap-ledger.js";
import { MintDecimals } from "../ports/mint-decimals.js";
import { TickSubmit } from "../ports/tick-submit.js";
import { memoryCapLedger } from "./memory-cap-ledger.js";
import { runStep } from "./run-step.js";
import { scriptedSpendMeter } from "./scripted-spend.js";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

const bounds = {
  maxNotionalPerTickUsd: "100",
  maxDailySpendUsd: "1000",
  allowedMints: /** @type {readonly string[]} */ ([]),
  expiresAt: null,
  maxConsecutiveFailures: 3,
};

/** @param {string} mint @param {string} intentId */
const request = (mint, intentId) => ({
  strategyId: "s",
  tickId: "t",
  intentId,
  notionalUsd: "1",
  mint,
});

const reader = Layer.succeed(MintDecimals, {
  decimalsOf: (mint) => Effect.succeed(mint === USDT ? undefined : 6),
});

const ledger = memoryCapLedger({
  boundsFor: () => /** @type {import("@solos-sh/actions").StrategyBounds} */ (bounds),
}).pipe(Layer.provideMerge(reader));

describe("mint decimals at reserve", () => {
  test("an unverified mint is refused and a later reserve does not reuse a hold", async () => {
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const cap = yield* CapLedger;
        const first = yield* cap.reserve(request(USDT, "bad")).pipe(Effect.either);
        const again = yield* cap.reserve(request(USDT, "bad")).pipe(Effect.either);
        const ok = yield* cap.reserve(request(USDC, "good"));
        return { first, again, ok };
      }).pipe(Effect.provide(ledger)),
    );
    expect(result.first._tag).toBe("Left");
    expect(result.again._tag).toBe("Left");
    if (result.first._tag === "Left") {
      expect(result.first.left).toBeInstanceOf(MintDecimalsUnverified);
      expect(result.first.left.remedy).toContain("mint account");
    }
    expect(result.ok.reservationId).toBe("res_1");
  });

  test("a tick whose mint cannot be verified sends nothing", async () => {
    let sends = 0;
    const quote = { reserveUsd: "0.00100000", actualUsd: "0.00100000", mint: USDT };
    const action = {
      type: /** @type {const} */ ("swap"),
      inputMint: USDT,
      outputMint: USDC,
      amount: "1000000",
      maxSlippageBps: 50,
    };
    const result = await Effect.runPromise(
      runStep({
        strategyId: "s",
        tickId: "t",
        intentId: "step",
        action,
      }).pipe(
        Effect.provide(
          Layer.mergeAll(
            ledger,
            scriptedSpendMeter(quote),
            Layer.sync(TickSubmit, () => ({
              submit: () =>
                Effect.sync(() => {
                  sends += 1;
                  return { intentId: "step", state: /** @type {const} */ ("settled") };
                }),
            })),
          ),
        ),
      ),
    );
    expect(result.outcome).toBe("skipped_bounds");
    expect(result.reason).toContain("could not be verified");
    expect(sends).toBe(0);
  });
});
