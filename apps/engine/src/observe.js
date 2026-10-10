// @ts-check
import { Effect } from "effect";

/**
 * The engine's `tool.completed`: one info line inside a log span, so stderr shows both the
 * span name and the completion. The code annotation on failure is the tag, never a message
 * that might carry a URL.
 * @template A, E, R
 * @param {import("effect").Effect.Effect<A, E, R>} effect
 * @param {string} route
 */
export const observed = (effect, route) =>
  effect.pipe(
    Effect.tap(() =>
      Effect.logInfo("tool.completed").pipe(Effect.annotateLogs({ route, surface: "engine" })),
    ),
    Effect.tapError((error) => logFailure(route, error)),
    Effect.withSpan(`engine.action.${route}`),
    Effect.withLogSpan(`engine.action.${route}`),
  );

/**
 * @param {string} route
 * @param {unknown} error
 */
const logFailure = (route, error) =>
  Effect.logWarning("tool.failed").pipe(
    Effect.annotateLogs({ route, surface: "engine", code: codeOf(error) }),
  );

/** @param {unknown} error */
const codeOf = (error) =>
  typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "unknown";
