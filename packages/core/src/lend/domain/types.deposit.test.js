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

  test("there is no owner argument: a stray owner key fails typed, never silently strips", () => {
    const stray = LendDepositInputSchema.safeParse({ mint: MINT, amount: "1", owner: OWNER });
    expect(stray.success).toBe(false);
    if (!stray.success) {
      expect(stray.error.issues.some((issue) => issue.code === "unrecognized_keys")).toBe(true);
    }
    expect(
      LendExecuteDepositInputSchema.safeParse({ mint: MINT, amount: "1", owner: OWNER }).success,
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
