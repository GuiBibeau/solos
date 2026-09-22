// @ts-check
import { describe, expect, test } from "bun:test";
import { LendDepositInputSchema, LendExecuteDepositInputSchema } from "./types.js";

const MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OWNER = "9y7uLMUMW6EiRwH1aJFSp9Zka7dVx2JdZKA3858u6YHT";

describe("lend deposit input", () => {
  test("a deposit needs a decodable mint and a positive u64 base-unit amount", () => {
    expect(LendDepositInputSchema.safeParse({ mint: MINT, amount: "1000000" }).success).toBe(true);
    expect(LendDepositInputSchema.safeParse({ mint: MINT, amount: "0" }).success).toBe(false);
    expect(LendDepositInputSchema.safeParse({ mint: MINT, amount: "-1" }).success).toBe(false);
    expect(LendDepositInputSchema.safeParse({ mint: MINT, amount: "1.5" }).success).toBe(false);
    expect(
      LendDepositInputSchema.safeParse({ mint: MINT, amount: "18446744073709551616" }).success,
    ).toBe(false);
    expect(LendDepositInputSchema.safeParse({ mint: "not-a-mint", amount: "1" }).success).toBe(
      false,
    );
  });

  test("an optional owner must decode to a 32-byte address when given", () => {
    expect(
      LendDepositInputSchema.safeParse({ mint: MINT, amount: "1", owner: OWNER }).success,
    ).toBe(true);
    expect(
      LendDepositInputSchema.safeParse({ mint: MINT, amount: "1", owner: "short" }).success,
    ).toBe(false);
  });

  test("the execute twin defaults skipSimulation to false", () => {
    const parsed = LendExecuteDepositInputSchema.parse({ mint: MINT, amount: "1000000" });
    expect(parsed.skipSimulation).toBe(false);
    expect(
      LendExecuteDepositInputSchema.parse({ mint: MINT, amount: "1", skipSimulation: true })
        .skipSimulation,
    ).toBe(true);
  });

  test("every field is described for discovery", () => {
    for (const schema of [LendDepositInputSchema, LendExecuteDepositInputSchema]) {
      expect(schema.shape.mint.description).toBeTruthy();
      expect(schema.shape.amount.description).toBeTruthy();
    }
  });
});
