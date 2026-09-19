import { describe, expect, test } from "bun:test";
import { ACTION_SAMPLES, OWNER } from "./action.fixtures.js";
import {
  ACTION_TYPES,
  ActionSchema,
  ExecutionResultSchema,
  SimulationResultSchema,
} from "./index.js";

describe("@solos/actions", () => {
  test("parses every action without changing exact amounts or routing", () => {
    for (const sample of ACTION_SAMPLES) expect(ActionSchema.parse(sample)).toEqual(sample);
    expect(ACTION_SAMPLES.map((sample) => sample.type)).toEqual([...ACTION_TYPES]);
  });

  test("rejects unknown types and number amounts", () => {
    expect(ActionSchema.safeParse({ type: "stake", amount: "1" }).success).toBe(false);
    expect(ActionSchema.safeParse({ type: "transfer_sol", to: OWNER, lamports: 1 }).success).toBe(
      false,
    );
    expect(
      ActionSchema.safeParse({ type: "transfer_sol", to: "nope", lamports: "1" }).success,
    ).toBe(false);
  });

  test("result schemas preserve every bounded action", () => {
    for (const action of ACTION_SAMPLES) {
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
        }).action,
      ).toEqual(action);
    }
  });
});
