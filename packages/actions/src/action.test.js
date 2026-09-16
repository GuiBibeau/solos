import { describe, expect, test } from "bun:test";
import {
  ACTION_TYPES,
  ActionSchema,
  ExecutionResultSchema,
  SimulationResultSchema,
} from "./index.js";

const OWNER = "7Zr8cNF4XeAgP3ttjTgzHk5Ffm4NWEoHuHybwDC6D8dY";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

describe("@solos/actions", () => {
  test("parses every action variant", () => {
    const samples = [
      { type: "transfer_sol", to: OWNER, lamports: "100000000" },
      { type: "swap", inputMint: USDC, outputMint: OWNER, amount: "5000000", maxSlippageBps: 50 },
      {
        type: "open_perp",
        market: "SOL-PERP",
        side: "long",
        notionalUsd: "1000000000",
        maxLeverage: 2,
      },
      { type: "close_perp", market: "SOL-PERP" },
      { type: "lend", protocol: "kamino", mint: USDC, amount: "1000000" },
      { type: "withdraw_lend", protocol: "kamino", mint: USDC, amount: "1000000" },
    ];
    for (const sample of samples) expect(ActionSchema.parse(sample)).toEqual(sample);
    expect(samples.map((s) => s.type)).toEqual([...ACTION_TYPES]);
  });

  test("rejects unknown types and bigint-as-number amounts", () => {
    expect(ActionSchema.safeParse({ type: "stake", amount: "1" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "transfer_sol", to: OWNER, lamports: 1 }).success).toBe(
      false,
    );
    expect(
      ActionSchema.safeParse({ type: "transfer_sol", to: "nope", lamports: "1" }).success,
    ).toBe(false);
  });

  test("result schemas carry the action back", () => {
    const action = { type: "transfer_sol", to: OWNER, lamports: "1" };
    expect(
      SimulationResultSchema.parse({
        action,
        ok: true,
        unitsConsumed: "150",
        logs: [],
        projectedPortfolio: null,
        violations: [],
      }).action,
    ).toEqual(action);
    expect(
      ExecutionResultSchema.parse({
        action,
        status: "confirmed",
        signature: "1".repeat(64),
        executedAt: 1,
        simulated: true,
        error: null,
      }).status,
    ).toBe("confirmed");
  });
});
