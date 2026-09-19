// @ts-check
import { describe, expect, test } from "bun:test";
import { progressBps } from "./progress.js";

/**
 * Expected values derived by hand from the documented protocol math
 * `floor((initial - real) x 10000 / initial)`, with initial = 793,100,000,000,000 (the
 * protocol's documented initial real token reserves, the test-seed anchor) — never computed
 * by re-running the implementation under test.
 */
const INITIAL = 793_100_000_000_000n;

describe("curve progress math", () => {
  test("a fresh curve with full real reserves sits at exactly 0 bps", () => {
    expect(progressBps(INITIAL, INITIAL)).toBe(0);
  });

  test("one base unit sold still floors to 0 bps", () => {
    // (1 x 10000) / 793100000000000 = 0.0000000126… → floor 0
    expect(progressBps(INITIAL, INITIAL - 1n)).toBe(0);
  });

  test("exactly 35 percent sold is exactly 3500 bps", () => {
    // 277585000000000 x 10000 / 793100000000000 = 3500 exactly
    expect(INITIAL - 515_515_000_000_000n).toBe(277_585_000_000_000n);
    expect((277_585_000_000_000n * 10_000n) % INITIAL).toBe(0n);
    expect(progressBps(INITIAL, 515_515_000_000_000n)).toBe(3500);
  });

  test("a curve one base unit from completion floors to 9999 bps", () => {
    // (793099999999999 x 10000) / 793100000000000 = 9999.99999… → floor 9999
    expect(progressBps(INITIAL, 1n)).toBe(9999);
  });

  test("a completed curve with zero real reserves is exactly 10000 bps", () => {
    expect(progressBps(INITIAL, 0n)).toBe(10_000);
  });

  test("an initial value below the current reserves clamps at 0 bps, never negative", () => {
    // A config-shrunk initial would make "sold" negative; the clamp holds the floor at 0.
    expect(progressBps(100n, 200n)).toBe(0);
    expect(progressBps(INITIAL, INITIAL + 100n)).toBe(0);
  });

  test("an over-full real reserve relative to initial clamps at 10000 bps", () => {
    expect(progressBps(100n, 0n)).toBe(10_000);
  });

  test("max-u64 reserves never overflow or round through a JS Number", () => {
    const MAX_U64 = 18_446_744_073_709_551_615n;
    expect(progressBps(MAX_U64, MAX_U64)).toBe(0);
    // (MAX_U64 - 1) x 10000 / MAX_U64 = 10000 - 10000/MAX_U64 → floor 9999
    expect(progressBps(MAX_U64, 1n)).toBe(9999);
    expect(progressBps(MAX_U64, 0n)).toBe(10_000);
    // Half sold floors to exactly 5000 regardless of magnitude.
    expect(progressBps(MAX_U64, MAX_U64 / 2n)).toBe(5000);
  });

  test("every result is an exact integer in the 0..10000 bound", () => {
    for (let real = 0n; real <= 20n; real++) {
      const bps = progressBps(20n, real);
      expect(Number.isSafeInteger(bps)).toBe(true);
      expect(bps).toBeGreaterThanOrEqual(0);
      expect(bps).toBeLessThanOrEqual(10_000);
    }
  });
});
