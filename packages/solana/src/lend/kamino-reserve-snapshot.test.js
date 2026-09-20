// @ts-check
import { describe, expect, test } from "bun:test";
import { LendingResponseInvalid, ReserveUnavailable } from "@solos/core/lend";
import { Cause, Effect, Exit, Option } from "effect";
import { reserveSnapshot } from "./kamino-reserve-snapshot.js";

const MAIN_MARKET = "7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const RESERVE = "KgVfRvAbmrqBsQWChanq2mb9uekPiPQ5vBAXBZfho1a";

/** A stand-in BN: exact decimal `toString`, never through a JS Number. */
const amount = (digits) => ({ toString: () => digits });

const parts = () => ({
  market: MAIN_MARKET,
  mint: USDC,
  reserveAddress: RESERVE,
  liquidityMint: USDC,
  availableAmount: amount("123456"),
  decimals: 6,
  supplyApy: 0.0482,
  borrowApy: 0.0913,
});

/**
 * @param {object} values
 * @returns {Promise<{ ok: boolean; value?: any; error?: any }>}
 */
const run = async (values) => {
  const exit = await Effect.runPromiseExit(
    /** @type {any} */ (reserveSnapshot(/** @type {any} */ ({ ...parts(), ...values }))),
  );
  if (Exit.isSuccess(exit)) return { ok: true, value: exit.value };
  const failure = Cause.failureOption(exit.cause);
  return { ok: false, error: Option.isSome(failure) ? failure.value : undefined };
};

describe("kamino reserve snapshot mapping", () => {
  test("maps a loaded reserve to the full snapshot with identities and exact units", async () => {
    const { ok, value } = await run({});
    expect(ok).toBe(true);
    expect(value).toMatchObject({
      protocol: "kamino",
      market: MAIN_MARKET,
      reserve: RESERVE,
      mint: USDC,
      decimals: 6,
      supplyApy: "0.0482",
      borrowApy: "0.0913",
      liquidity: "123456",
    });
    expect(Number.isSafeInteger(value.at)).toBe(true);
  });

  test("an existing reserve with zero availability is a success with liquidity 0", async () => {
    const { ok, value } = await run({ availableAmount: amount("0") });
    expect(ok).toBe(true);
    expect(value.liquidity).toBe("0");
  });

  test("max-u64 availability maps verbatim — never through a JS Number", async () => {
    const { ok, value } = await run({ availableAmount: amount("18446744073709551615") });
    expect(ok).toBe(true);
    expect(value.liquidity).toBe("18446744073709551615");
  });

  test("very small APYs surface in e-notation verbatim", async () => {
    const { ok, value } = await run({ supplyApy: 5e-7 });
    expect(ok).toBe(true);
    expect(value.supplyApy).toBe("5e-7");
  });

  test("a reserve whose liquidity mint differs from the request fails ReserveUnavailable", async () => {
    const { ok, error } = await run({ liquidityMint: "11111111111111111111111111111111" });
    expect(ok).toBe(false);
    expect(error).toBeInstanceOf(ReserveUnavailable);
    expect(error?.market).toBe(MAIN_MARKET);
    expect(error?.mint).toBe(USDC);
  });

  test("decimals outside 0..18 fail LendingResponseInvalid", async () => {
    const { ok, error } = await run({ decimals: 19 });
    expect(ok).toBe(false);
    expect(error).toBeInstanceOf(LendingResponseInvalid);
  });

  test("a negative or non-finite APY fails LendingResponseInvalid, never a coerced value", async () => {
    for (const supplyApy of [-0.05, NaN, Infinity]) {
      const { ok, error } = await run({ supplyApy });
      expect(ok).toBe(false);
      expect(error).toBeInstanceOf(LendingResponseInvalid);
    }
  });
});
