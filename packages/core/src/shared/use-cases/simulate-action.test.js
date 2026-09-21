// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Layer, Option } from "effect";
import { ActionExecutor } from "../ports/action-executor.js";
import { simulateAction } from "./simulate-action.js";

/** @type {import("@solos/actions").Action} */
const action = {
  type: "transfer_sol",
  to: "11111111111111111111111111111111",
  lamports: "1000",
};

/** @type {{ ok: boolean; violations: { rule: string; message: string }[] }} */
const mode = { ok: true, violations: [] };

const layer = Layer.succeed(
  ActionExecutor,
  /** @type {import("../ports/action-executor.js").ActionExecutorShape} */ ({
    name: "stub",
    simulate: (received) =>
      Effect.succeed({
        action: received,
        ok: mode.ok,
        unitsConsumed: "42",
        logs: ["log-line"],
        projectedPortfolio: null,
        violations: mode.violations,
      }),
    execute: () => Effect.die("not used here"),
  }),
);

/** @param {import("effect").Exit<unknown, unknown>} exit */
const failureOf = (exit) => {
  expect(exit._tag).toBe("Failure");
  const failure = Cause.failureOption(exit.cause);
  expect(Option.isSome(failure)).toBe(true);
  return Option.getOrThrow(failure);
};

describe("simulateAction — the executor's simulation contract", () => {
  test("an ok simulation passes through untouched", async () => {
    const exit = await Effect.runPromiseExit(Effect.provide(simulateAction({ action }), layer));
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value.ok).toBe(true);
      expect(exit.value.action).toEqual(action);
    }
  });

  test("a not-ok simulation is a typed SimulationFailed with violations joined and logs kept", async () => {
    mode.ok = false;
    mode.violations = [
      { rule: "bounds", message: "over budget" },
      { rule: "lifetime", message: "blockhash expired" },
    ];
    const exit = await Effect.runPromiseExit(Effect.provide(simulateAction({ action }), layer));
    const error = /** @type {import("../domain/errors.js").SimulationFailed} */ (failureOf(exit));
    expect(error._tag).toBe("SimulationFailed");
    expect(error.reason).toBe("bounds: over budget; lifetime: blockhash expired");
    expect(error.logs).toEqual(["log-line"]);
    mode.ok = true;
    mode.violations = [];
  });

  test("a not-ok simulation with no violations still fails with a reason", async () => {
    mode.ok = false;
    const exit = await Effect.runPromiseExit(Effect.provide(simulateAction({ action }), layer));
    expect(
      /** @type {import("../domain/errors.js").SimulationFailed} */ (failureOf(exit)).reason,
    ).toBe("simulation failed");
    mode.ok = true;
  });
});
