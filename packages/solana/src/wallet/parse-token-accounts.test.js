import { describe, expect, test } from "bun:test";
import { formatUiAmount } from "./parse-token-accounts.js";

describe("token amount formatting", () => {
  test("applies decimals without float math", () => {
    expect(formatUiAmount(5_000_000n, 6)).toBe("5");
    expect(formatUiAmount(1n, 6)).toBe("0.000001");
    expect(formatUiAmount(123_456_789n, 6)).toBe("123.456789");
    expect(formatUiAmount(42n, 0)).toBe("42");
  });
});
