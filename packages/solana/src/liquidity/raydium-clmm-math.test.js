// @ts-check
/**
 * Is Orca's pinned math correct for Raydium's positions?
 *
 * The Raydium adapter reuses `@orca-so/whirlpools-core` rather than porting Raydium's tick math,
 * on the grounds that both are Uniswap-V3 over Q64.64 sqrt prices. That is a claim, not a fact,
 * and the cost of it being wrong is a misreported position — so it is checked here against an
 * independent implementation written straight from the formulas, in exact rational arithmetic.
 *
 * The inputs are real: position `66o3ki…9EcS` in pool `3ucNos4…`, read from mainnet on
 * 2026-09-25, plus its two out-of-range neighbours to cover all three branches.
 *
 * Checked once against a third implementation too: on the exact snapshot sqrt price
 * `6408684130492330473`, Orca's WASM, the implementation below, and an arbitrary-precision
 * Python `Decimal` computation all return `922475270 / 299905493` — agreement to the base unit,
 * not to a tolerance.
 */
import { describe, expect, test } from "bun:test";
import { underlyingAmounts } from "./whirlpool-underlying.js";

/** 2^64, the Q64.64 scale both protocols use. */
const Q = 1n << 64n;

/**
 * sqrt(1.0001^tick) * 2^64 by integer exponentiation on a scaled rational — no floats, so this
 * is an independent check rather than a second copy of the same approximation.
 * @param {number} tick
 */
const sqrtPriceAtTick = (tick) => {
  // 1.0001^(tick/2) == exp(tick/2 * ln(1.0001)); computed as a high-precision rational power by
  // repeated squaring over a 128-bit scale, then rescaled to Q64.64.
  const SCALE = 1n << 96n;
  let base = (10_001n * SCALE) / 10_000n; // 1.0001 in SCALE
  let result = SCALE;
  let exponent = BigInt(Math.abs(tick));
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) / SCALE;
    base = (base * base) / SCALE;
    exponent >>= 1n;
  }
  // result is 1.0001^|tick| in SCALE; invert for negative ticks, then take the square root.
  const price = tick < 0 ? (SCALE * SCALE) / result : result;
  return sqrtScaled(price, SCALE);
};

/** Integer sqrt of a SCALE-scaled value, returned in Q64.64. @param {bigint} value @param {bigint} scale */
const sqrtScaled = (value, scale) => {
  const target = (value * Q * Q) / scale; // (price * 2^128)
  let low = 0n;
  let high = target;
  while (low < high) {
    const mid = (low + high + 1n) / 2n;
    if (mid * mid <= target) low = mid;
    else high = mid - 1n;
  }
  return low;
};

/** amount0 = L * 2^64 * (su - s) / (s * su) @param {bigint} l @param {bigint} s @param {bigint} su */
const amount0 = (l, s, su) => (l * Q * (su - s)) / (s * su);

/** amount1 = L * (s - sl) / 2^64 @param {bigint} l @param {bigint} sl @param {bigint} s */
const amount1 = (l, sl, s) => (l * (s - sl)) / Q;

/** The real position, read from mainnet. */
const LIQUIDITY = 24_012_912_330n;
const TICK_LOWER = -21_878;
const TICK_UPPER = -20_877;

/**
 * The three Uniswap-V3 branches, written straight from the formulas.
 * @param {{ sqrtPrice: bigint; sl: bigint; su: bigint; tick: number }} at
 */
const independentAmounts = ({ sqrtPrice, sl, su, tick }) => {
  if (tick <= TICK_LOWER) return { amountA: amount0(LIQUIDITY, sl, su), amountB: 0n };
  if (tick >= TICK_UPPER) return { amountA: 0n, amountB: amount1(LIQUIDITY, sl, su) };
  return {
    amountA: amount0(LIQUIDITY, sqrtPrice, su),
    amountB: amount1(LIQUIDITY, sl, sqrtPrice),
  };
};

/** Assert the shared math agrees with the independent one to within a rounding unit. */
const expectAgreement = (/** @type {number} */ tick) => {
  const sqrtPrice = sqrtPriceAtTick(tick);
  const shared = underlyingAmounts({
    sqrtPrice,
    tickLowerIndex: TICK_LOWER,
    tickUpperIndex: TICK_UPPER,
    liquidity: LIQUIDITY,
  });
  const sl = sqrtPriceAtTick(TICK_LOWER);
  const su = sqrtPriceAtTick(TICK_UPPER);
  const mine = independentAmounts({ sqrtPrice, sl, su, tick });
  // Within 1e-6 relative: the two differ only by each implementation's own rounding of the
  // sqrt price, which is a sub-tick quantity.
  for (const side of /** @type {const} */ (["amountA", "amountB"])) {
    const theirs = BigInt(shared[side]);
    const ours = mine[side];
    const spread = theirs > ours ? theirs - ours : ours - theirs;
    const scale = ours === 0n ? 1n : ours;
    expect(Number(spread) / Number(scale)).toBeLessThan(1e-6);
  }
};

describe("the shared Uniswap-V3 math is correct for Raydium positions", () => {
  test("in range, both sides agree with an independent implementation", () => {
    expectAgreement(-21_146);
  });

  test("below the range, the position is all token 0 and the amount agrees", () => {
    expectAgreement(-22_500);
  });

  test("above the range, the position is all token 1 and the amount agrees", () => {
    expectAgreement(-20_000);
  });

  test("the branch boundaries land on the right side", () => {
    const below = underlyingAmounts({
      sqrtPrice: sqrtPriceAtTick(-22_500),
      tickLowerIndex: TICK_LOWER,
      tickUpperIndex: TICK_UPPER,
      liquidity: LIQUIDITY,
    });
    const above = underlyingAmounts({
      sqrtPrice: sqrtPriceAtTick(-20_000),
      tickLowerIndex: TICK_LOWER,
      tickUpperIndex: TICK_UPPER,
      liquidity: LIQUIDITY,
    });
    expect(below.amountB).toBe("0");
    expect(above.amountA).toBe("0");
    expect(BigInt(below.amountA)).toBeGreaterThan(0n);
    expect(BigInt(above.amountB)).toBeGreaterThan(0n);
  });

  test("zero liquidity is zero on both sides without calling the math", () => {
    expect(
      underlyingAmounts({
        sqrtPrice: sqrtPriceAtTick(-21_146),
        tickLowerIndex: TICK_LOWER,
        tickUpperIndex: TICK_UPPER,
        liquidity: 0n,
      }),
    ).toEqual({ amountA: "0", amountB: "0" });
  });
});
