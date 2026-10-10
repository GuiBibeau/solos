// @ts-check
import { InternalError, ValidationError, errorEnvelope } from "@solos/core";
import { Effect } from "effect";
import { z } from "zod";

/**
 * Startup failures leave as `{ error: { code, ... } }`. A Zod failure names the field and
 * never the value, so a token or RPC path in an invalid string cannot reach stderr twice.
 * @param {unknown} error
 */
export const asStartupError = (error) => {
  if (isTagged(error)) return error;
  if (error instanceof z.ZodError) return invalidEnv(error);
  return new InternalError({ operation: "engine.start", reason: "engine failed to start" });
};

/**
 * @template A, E, R
 * @param {import("effect").Effect.Effect<A, E, R>} effect
 */
export const exitOnFailure = (effect) =>
  effect.pipe(
    Effect.tapError((error) => Effect.sync(() => reportFailure(error))),
    Effect.catchAll(() => Effect.void),
  );

/** @param {unknown} error */
const reportFailure = (error) => {
  const envelope = errorEnvelope(error) ?? {
    code: "InternalError",
    reason: "engine failed to start",
  };
  process.stderr.write(`${JSON.stringify({ error: envelope })}\n`);
  process.exitCode = 1;
};

/** @param {z.ZodError} error */
const invalidEnv = (error) => {
  const field = error.issues[0]?.path.join(".") || "env";
  return new ValidationError({
    field,
    value: null,
    reason: `${field} is invalid`,
    remedy: "fix the environment value and start the engine again",
  });
};

/** @param {unknown} error */
const isTagged = (error) =>
  typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string";
