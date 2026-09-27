// @ts-check
import { errorEnvelope, toJsonSafe } from "@solos/core";
import { Effect } from "effect";

/**
 * Always JSON, so agents can parse it. Pretty when a human is watching a TTY.
 * @param {unknown} value
 */
export const emit = (value) =>
  Effect.sync(() => {
    const safe = toJsonSafe(value);
    const text = process.stdout.isTTY ? JSON.stringify(safe, null, 2) : JSON.stringify(safe);
    process.stdout.write(`${text}\n`);
  });

/**
 * Domain errors exit non-zero with the same `{ code, ...props }` shape MCP clients see.
 * @template A, E, R
 * @param {Effect.Effect<A, E, R>} effect
 */
export const exitOnFailure = (effect) =>
  effect.pipe(
    Effect.tapErrorCause((cause) =>
      Effect.sync(() => {
        process.stderr.write(`${JSON.stringify({ error: describeCause(cause) })}\n`);
        process.exitCode = 1;
      }),
    ),
    Effect.catchAllCause(() => Effect.void),
  );

/**
 * The first domain error in a cause. Layer composition (one graph, many built layers) can
 * turn a single failed build into a parallel or sequential cause; the domain error inside is
 * still the meaningful thing to report.
 * @param {import("effect").Cause.Cause<unknown>} cause
 * @returns {{ _tag?: string } | undefined}
 */
const firstFailure = (cause) => {
  if (cause._tag === "Fail") {
    return /** @type {{ _tag?: string } | undefined} */ (cause.error);
  }
  if (cause._tag === "Parallel" || cause._tag === "Sequential") {
    const fromLeft = firstFailure(cause.left);
    if (fromLeft !== undefined) return fromLeft;
    return firstFailure(cause.right);
  }
  return undefined;
};

/** @param {import("effect").Cause.Cause<unknown>} cause */
const describeCause = (cause) => {
  const failure = /** @type {{ _tag?: string } | undefined} */ (firstFailure(cause));
  return errorEnvelope(failure) ?? { code: "InternalError", reason: String(cause) };
};
