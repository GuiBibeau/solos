// @ts-check
import { describe, expect, test } from "bun:test";
import { transferFeeReserveLamports } from "@solos/solana/executor/transfer-fee";
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

  test("the hold adds the builder fee reserve, including a zero transfer", () => {
    const reserve = transferFeeReserveLamports();
    expect(transferNotionalUsd("0", "100")).toBe(lamportsToUsd(reserve.toString(), "100"));
    expect(transferNotionalUsd("10000000", "100")).toBe(
      lamportsToUsd((10_000_000n + reserve).toString(), "100"),
    );
    expect(transferNotionalUsd("20000000", "100")).toBe(
      lamportsToUsd((20_000_000n + reserve).toString(), "100"),
    );
    expect(transferNotionalUsd("nope", "100")).toBeUndefined();
  });
});
