import { describe, expect, test } from "bun:test";
import { ValidationError } from "../../shared/domain/errors.js";
import { transferLamports } from "./amount.js";

/**
 * Catch the domain rule's rejection so tests can assert on the structured error itself.
 * @param {string | number} amountSol
 * @returns {unknown} the thrown ValidationError, or null when the amount was accepted
 */
const rejection = (amountSol) => {
  try {
    transferLamports(amountSol);
  } catch (error) {
    return error;
  }
  return null;
};

describe("transfer amount rule", () => {
  test("rejects zero-equivalents and values that truncate to zero lamports", () => {
    for (const amountSol of ["0", "0.0", "0.000000000", "000", 0, 4.9e-10, ".0000000001"]) {
      expect(rejection(amountSol)).toBeInstanceOf(ValidationError);
      expect(rejection(amountSol)).toMatchObject({ field: "amountSol", value: amountSol });
    }
  });

  test("rejects junk and malformed grammar as input-validation errors", () => {
    for (const amountSol of ["abc", "", "--1", "--1.1", "1-1", "1.2.3", " 1", "1e", "e9"]) {
      expect(rejection(amountSol)).toBeInstanceOf(ValidationError);
      expect(rejection(amountSol)).toMatchObject({ field: "amountSol", value: amountSol });
    }
  });

  test("rejects negative amounts, scientific and fractional alike", () => {
    for (const amountSol of ["-1", "-0.5", "-.5", "-1e-9", "-0.000000001", "-2e+21"]) {
      expect(rejection(amountSol)).toBeInstanceOf(ValidationError);
      expect(rejection(amountSol)).toMatchObject({ field: "amountSol", value: amountSol });
    }
  });

  test("rejects out-of-range exponents without expanding them", () => {
    for (const amountSol of ["1e+999999999", "2e+2147483647", "1e-999999999"]) {
      expect(rejection(amountSol)).toBeInstanceOf(ValidationError);
      expect(rejection(amountSol)).toMatchObject({ field: "amountSol", value: amountSol });
    }
  });

  test("accepts exact positive amounts down to one lamport", () => {
    expect(transferLamports(1e-9)).toBe(1n);
    expect(transferLamports("0.000000001")).toBe(1n);
    expect(transferLamports(".5")).toBe(500_000_000n);
    expect(transferLamports(".000000001")).toBe(1n);
    expect(transferLamports("0.25")).toBe(250_000_000n);
    expect(transferLamports("1.000000001")).toBe(1_000_000_001n);
  });
});
