import { describe, expect, test } from "bun:test";
import { lamportsToSol, solToLamports } from "./lamports.js";

describe("lamports math", () => {
  test("converts whole SOL", () => {
    expect(solToLamports(2)).toBe(2_000_000_000n);
    expect(lamportsToSol(2_000_000_000n)).toBe("2");
  });

  test("converts fractional SOL both ways", () => {
    expect(solToLamports("0.25")).toBe(250_000_000n);
    expect(solToLamports("1.000000001")).toBe(1_000_000_001n);
    expect(lamportsToSol(1_000_000_001n)).toBe("1.000000001");
    expect(lamportsToSol(1n)).toBe("0.000000001");
  });

  test("truncates beyond nine decimals", () => {
    expect(solToLamports("0.1234567899")).toBe(123_456_789n);
  });

  test("expands exponent notation exactly, without floating-point math", () => {
    expect(solToLamports(1e-9)).toBe(1n);
    expect(solToLamports("1.5e-7")).toBe(150n);
    expect(solToLamports("4.9e-10")).toBe(0n);
    expect(solToLamports("2e+21")).toBe(2_000_000_000_000_000_000_000_000_000_000n);
  });

  test("carries the sign through conversion, so negatives stay negative", () => {
    expect(solToLamports("-1e-9")).toBe(-1n);
    expect(solToLamports("-0.000000001")).toBe(-1n);
    expect(solToLamports("-0.5")).toBe(-500_000_000n);
    expect(solToLamports("-1")).toBe(-1_000_000_000n);
    expect(solToLamports("-2e+21")).toBe(-2_000_000_000_000_000_000_000_000_000_000n);
  });
});
