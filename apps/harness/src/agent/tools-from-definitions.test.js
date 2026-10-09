// @ts-check
import { describe, expect, test } from "bun:test";
import { SelectionInputInvalid } from "@solos/core";
import { Effect, Layer, ManagedRuntime } from "effect";
import { z } from "zod";
import { toolsFromDefinitions } from "./tools-from-definitions.js";

const runtime = ManagedRuntime.make(Layer.empty);

/** A definition whose pure guard refuses before the runtime is touched. */
const guarded = () => {
  let ran = 0;
  /** @type {import("@solos/core").AnyToolDefinition} */
  const definition = {
    name: "solana_test_do_thing",
    group: "test",
    tier: "read",
    stability: "beta",
    title: "Test",
    description: "A test tool whose guard refuses negative amounts before anything runs.",
    input: z.object({ amount: z.number().describe("An amount") }),
    check: (input) => {
      if (input.amount < 0) {
        throw new SelectionInputInvalid({ reason: "amount must be zero or more" });
      }
    },
    run: (input) => {
      ran += 1;
      return Effect.succeed({ doubled: input.amount * 2 });
    },
  };
  return { definition, ran: () => ran };
};

describe("toolsFromDefinitions", () => {
  test("runs the definition's check before the runtime, and returns its structured error", async () => {
    const { definition, ran } = guarded();
    const tool = toolsFromDefinitions([definition], runtime)[definition.name];
    const refused = await tool?.execute?.({ amount: -1 }, { toolCallId: "c1", messages: [] });
    expect(refused).toMatchObject({
      code: "SelectionInputInvalid",
      reason: "amount must be zero or more",
    });
    expect(ran()).toBe(0);
  });

  test("a passing check runs the tool on the runtime", async () => {
    const { definition, ran } = guarded();
    const tool = toolsFromDefinitions([definition], runtime)[definition.name];
    const result = await tool?.execute?.({ amount: 2 }, { toolCallId: "c2", messages: [] });
    expect(result).toEqual({ doubled: 4 });
    expect(ran()).toBe(1);
  });
});
