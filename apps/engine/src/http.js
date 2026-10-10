// @ts-check
import { ValidationError, errorEnvelope, toJsonSafe } from "@solos/core";
import { Cause, Option } from "effect";

const MAX_BODY_BYTES = 1_000_000;

/**
 * @typedef {import("./config.js").Tier} Tier
 * @typedef {import("./config.js").Mode} Mode
 * @typedef {{
 *   readonly token: string;
 *   readonly tier: Tier;
 *   readonly mode: Mode;
 *   readonly signer: string;
 *   readonly rpcHost: string;
 *   readonly startedAt: number;
 *   readonly db: import("bun:sqlite").Database;
 *   readonly runtime: import("effect").ManagedRuntime.ManagedRuntime<any, any>;
 *   readonly executor: import("@solos/core/shared").ActionExecutorShape;
 *   readonly strategyHandle?: (
 *     request: Request,
 *     deps: EngineDeps,
 *     pathname: string,
 *   ) => Promise<Response>;
 *   readonly caps?: boolean;
 * }} EngineDeps
 */

/** HTTP status for a domain-error code. Anything else is an executor failure (422). */
const STATUS = /** @type {Record<string, number>} */ ({
  ValidationError: 400,
  EngineUnauthorized: 401,
  TierWithheld: 403,
  IntentNotFound: 404,
  IntentInFlight: 409,
  StrategyNotFound: 404,
  StrategyInvalid: 400,
  StrategyTransitionRefused: 409,
  BoundsExceeded: 422,
  KillSwitchEngaged: 423,
  SignerUnavailable: 503,
  RpcError: 503,
  RpcConfigMissing: 503,
  SurfpoolUnavailable: 503,
  EngineUnavailable: 503,
  PriceUnavailable: 503,
});

/**
 * @param {number} status
 * @param {unknown} body
 */
export const json = (status, body) =>
  Response.json(toJsonSafe(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** @param {unknown} error */
export const errorResponse = (error) => {
  const envelope = envelopeOf(error);
  return json(statusFor(String(envelope.code)), { error: envelope });
};

/** @param {string} code */
export const statusFor = (code) => STATUS[code] ?? 422;

/** @param {Request} request */
export const readJson = async (request) => {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES)
    return { ok: false, error: invalidBody("request body is too large") };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, error: invalidBody("request body is not JSON") };
  }
};

/**
 * Schema failure. `value` stays null so a body cannot echo a secret back.
 * @param {string} field
 * @param {string} reason
 */
export const invalid = (field, reason) =>
  new ValidationError({
    field,
    value: null,
    reason,
    remedy: "send an action object that matches the action schema",
  });

/** @param {unknown} error */
export const envelopeOf = (error) => {
  const value = unwrap(error);
  return (
    errorEnvelope(value) ?? {
      code: "InternalError",
      reason: "engine execution failed",
    }
  );
};

/** @param {string} reason */
const invalidBody = (reason) => invalid("body", reason);

const FIBER_FAILURE = Symbol.for("effect/Runtime/FiberFailure/Cause");

/**
 * `runPromise` rejects with a FiberFailure whose cause is a non-enumerable symbol.
 * The tagged error inside is what the wire should carry.
 * @param {unknown} error
 */
const unwrap = (error) => {
  const cause = causeOf(error);
  if (cause === undefined) return error;
  const failure = Cause.failureOption(cause);
  return Option.isSome(failure) ? failure.value : error;
};

/** @param {unknown} error */
const causeOf = (error) => {
  if (Cause.isCause(error)) return error;
  if (typeof error !== "object" || error === null) return undefined;
  const cause = /** @type {{ [key: symbol]: unknown }} */ (error)[FIBER_FAILURE];
  return Cause.isCause(cause) ? cause : undefined;
};
