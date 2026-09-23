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

  test("onboarding simulation preserves the estimated wallet debit as a decimal lamport string", () => {
    const action = ACTION_SAMPLES.find((sample) => sample.type === "onboard_perp");
    const simulation = {
      action,
      ok: true,
      unitsConsumed: "28426",
      logs: [],
      projectedPortfolio: null,
      venueQuote: { kind: "perp_onboard", estimatedSpendLamports: "27899040" },
      violations: [],
    };
    expect(SimulationResultSchema.parse(simulation).venueQuote).toEqual(simulation.venueQuote);
    expect(
      SimulationResultSchema.safeParse({
        ...simulation,
        venueQuote: { kind: "perp_onboard", estimatedSpendLamports: 27_899_040 },
      }).success,
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
