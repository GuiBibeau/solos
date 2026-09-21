// @ts-check
import { describe, expect, test } from "bun:test";
import { Cause, Effect, Layer, Option } from "effect";
import { ActionExecutor } from "../ports/action-executor.js";
import { EventBus } from "../ports/event-bus.js";
import { executeAction } from "./execute-action.js";

/** @type {import("@solos/actions").Action} */
const action = {
  type: "transfer_sol",
  to: "11111111111111111111111111111111",
  lamports: "1000",
};

const executorLayer = () =>
  Layer.succeed(
    ActionExecutor,
    /** @type {import("../ports/action-executor.js").ActionExecutorShape} */ ({
      name: "stub",
      simulate: () => Effect.die("not used here"),
      execute: (received, options) =>
        Effect.succeed({
          action: received,
          status: mode.status,
          signature: mode.signature,
          executedAt: 1,
          simulated: !options.skipSimulation,
          error: mode.error ?? null,
        }),
    }),
  );

/** @type {{ status: "confirmed" | "failed"; signature: string | null; error?: string }} */
const mode = { status: "confirmed", signature: "sig" };

/** @type {import("../domain/event.js").SolosEvent[]} */
const published = [];

const layer = () =>
  Layer.merge(
    executorLayer(),
    Layer.succeed(
      EventBus,
      /** @type {import("../ports/event-bus.js").EventBusShape} */ ({
        publish: (event) => {
          published.push(event);
          return Effect.succeed(undefined);
        },
        subscribe: () => Effect.die("not used here"),
      }),
    ),
  );

/** @param {import("effect").Exit<unknown, unknown>} exit */
const failureOf = (exit) => {
  expect(exit._tag).toBe("Failure");
  const failure = Cause.failureOption(exit.cause);
  expect(Option.isSome(failure)).toBe(true);
  return Option.getOrThrow(failure);
};

describe("executeAction — the one home of the executor contract", () => {
  test("hands the built Action to the executor with skipSimulation forwarded", async () => {
    const exit = await Effect.runPromiseExit(
      Effect.provide(executeAction({ action, skipSimulation: true }), layer()),
    );
    expect(exit._tag).toBe("Success");
    if (exit._tag === "Success") {
      expect(exit.value.action).toEqual(action);
      expect(exit.value.simulated).toBe(false);
    }
  });

  test("a non-confirmed or signature-less result is a typed TransactionFailed naming the executor", async () => {
    mode.status = "failed";
    mode.signature = null;
    mode.error = "boom";
    const failed = await Effect.runPromiseExit(Effect.provide(executeAction({ action }), layer()));
    const error = /** @type {import("../domain/errors.js").TransactionFailed} */ (
      failureOf(failed)
    );
    expect(error._tag).toBe("TransactionFailed");
    expect(error.reason).toBe("boom");
    expect(error.signature).toBeNull();

    mode.error = undefined;
    const unnamed = await Effect.runPromiseExit(Effect.provide(executeAction({ action }), layer()));
    const unnamedError = /** @type {import("../domain/errors.js").TransactionFailed} */ (
      failureOf(unnamed)
    );
    expect(unnamedError.reason).toBe("executor stub returned failed");
    mode.status = "confirmed";
    mode.signature = "sig";
  });

  test("success with an event name publishes one event carrying the result", async () => {
    published.length = 0;
    await Effect.runPromiseExit(
      Effect.provide(executeAction({ action, event: "transfer.sent" }), layer()),
    );
    expect(published.length).toBe(1);
    expect(published[0].type).toBe("transfer.sent");
    expect(published[0].payload).toEqual({
      action,
      status: "confirmed",
      signature: "sig",
      executedAt: 1,
      simulated: true,
      error: null,
    });
  });

  test("no event name, no publication — and nothing on failure", async () => {
    published.length = 0;
    await Effect.runPromiseExit(Effect.provide(executeAction({ action }), layer()));
    expect(published.length).toBe(0);

    mode.status = "failed";
    mode.signature = null;
    await Effect.runPromiseExit(
      Effect.provide(executeAction({ action, event: "transfer.sent" }), layer()),
    );
    expect(published.length).toBe(0);
    mode.status = "confirmed";
    mode.signature = "sig";
  });
});
