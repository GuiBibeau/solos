// @ts-check
import { describe, expect, test } from "bun:test";
import { lamportsToUsd, transferNotionalUsd } from "./sol-notional.js";

describe("SOL notional", () => {
  test("0.01 SOL at 100 USD is exactly 1", () => {
    expect(lamportsToUsd("10000000", "100")).toBe("1");
    expect(lamportsToUsd("20000000", "100")).toBe("2");
  });

  test("one lamport keeps its fraction instead of rounding up to a dollar", () => {
    expect(lamportsToUsd("1", "100")).toBe("0.0000001");
  });

  test("a fractional SOL price stays exact", () => {
    expect(lamportsToUsd("1000000000", "150.25")).toBe("150.25");
    expect(lamportsToUsd("10000000", "100.0")).toBe("1");
  });

  test("a malformed price or lamport amount is refused", () => {
    expect(lamportsToUsd("1.5", "100")).toBeUndefined();
    expect(lamportsToUsd("1", "-1")).toBeUndefined();
  });

  test("the hold adds the 6000 lamport fee reserve, including a zero transfer", () => {
    expect(transferNotionalUsd("10000000", "100")).toBe("1.0006");
    expect(transferNotionalUsd("20000000", "100")).toBe("2.0006");
    expect(transferNotionalUsd("0", "100")).toBe("0.0006");
    expect(transferNotionalUsd("nope", "100")).toBeUndefined();
  });
});
