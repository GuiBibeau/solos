import { describe, expect, test } from "bun:test";
import {
  formatUiAmount,
  isTokenAccountRow,
  TOKEN_2022_PROGRAM,
  TOKEN_PROGRAM,
} from "./parse-token-accounts.js";

describe("token amount formatting", () => {
  test("applies decimals without float math", () => {
    expect(formatUiAmount(5_000_000n, 6)).toBe("5");
    expect(formatUiAmount(1n, 6)).toBe("0.000001");
    expect(formatUiAmount(123_456_789n, 6)).toBe("123.456789");
    expect(formatUiAmount(42n, 0)).toBe("42");
  });
});

describe("isTokenAccountRow", () => {
  test("accepts a base-size account on either token program", () => {
    expect(isTokenAccountRow({ owner: TOKEN_PROGRAM, byteLength: 165 })).toBe(true);
    expect(isTokenAccountRow({ owner: TOKEN_2022_PROGRAM, byteLength: 200 })).toBe(true);
  });

  test("refuses a system account parked at the address, and a truncated one", () => {
    expect(isTokenAccountRow({ owner: "11111111111111111111111111111111", byteLength: 0 })).toBe(
      false,
    );
    expect(isTokenAccountRow({ owner: TOKEN_PROGRAM, byteLength: 64 })).toBe(false);
  });
});
