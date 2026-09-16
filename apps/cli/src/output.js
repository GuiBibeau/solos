// @ts-check
import { toJsonSafe } from "@solos/core";
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

/** @param {import("effect").Cause.Cause<unknown>} cause */
const describeCause = (cause) => {
  const failure = /** @type {{ _tag?: string } | undefined} */ (
    cause._tag === "Fail" ? cause.error : undefined
  );
  if (failure && typeof failure === "object" && "_tag" in failure) {
    const { _tag, ...props } = /** @type {Record<string, unknown>} */ (failure);
    return { code: _tag, .../** @type {Record<string, unknown>} */ (toJsonSafe(props)) };
  }
  return { code: "InternalError", reason: String(cause) };
};
