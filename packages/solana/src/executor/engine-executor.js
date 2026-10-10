// @ts-check
import { ActionExecutor, EngineUnavailable } from "@solos/core";
import { ExecutionResultSchema, SimulationResultSchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { enginePost } from "./engine-client.js";
import { originOf } from "./engine-error.js";

const SIMULATE_TIMEOUT_MS = 30_000;
/** Confirmation on the engine can take the slow-mode deadline (75s) plus a margin. */
const EXECUTE_TIMEOUT_MS = 90_000;

/** @typedef {import("./engine-client.js").EngineEndpoint} EngineEndpoint */
/** @typedef {import("@solos-sh/actions").Action} Action */

/**
 * @param {import("zod").ZodType} schema
 * @param {unknown} body
 * @param {string} url
 */
const decodeResult = (schema, body, url) => {
  const parsed = schema.safeParse(body);
  if (parsed.success) return Effect.succeed(parsed.data);
  return Effect.fail(
    new EngineUnavailable({
      url: originOf(url),
      reason: "the engine returned a result that does not match the action contract",
      remedy: "check that the caller and the engine are the same solOS version",
    }),
  );
};

/**
 * The Caller did not pass an id, so this request is a new Intent. A supplied id is how a repeat
 * finds the stored outcome instead of sending again.
 * @param {{ readonly intentId?: string }} options
 */
const intentIdOf = (options) =>
  options.intentId === undefined || options.intentId.length === 0
    ? crypto.randomUUID()
    : options.intentId;

/**
 * @param {EngineEndpoint} engine
 * @param {Action} action
 */
const simulate = (engine, action) =>
  enginePost(engine, "/v1/actions/simulate", {
    body: { action },
    timeoutMs: SIMULATE_TIMEOUT_MS,
  }).pipe(Effect.flatMap((body) => decodeResult(SimulationResultSchema, body, engine.url)));

/**
 * @param {EngineEndpoint} engine
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean; readonly intentId?: string }} options
 */
const execute = (engine, action, options) =>
  enginePost(engine, "/v1/actions/execute", {
    body: {
      action,
      intentId: intentIdOf(options),
      skipSimulation: options.skipSimulation,
    },
    timeoutMs: EXECUTE_TIMEOUT_MS,
  }).pipe(Effect.flatMap((body) => decodeResult(ExecutionResultSchema, body, engine.url)));

/**
 * `ActionExecutor` over HTTP. Nothing above the port learns that execution left the process.
 * @param {EngineEndpoint} engine
 */
export const EngineExecutor = (engine) =>
  Layer.succeed(
    ActionExecutor,
    /** @type {import("@solos/core/shared").ActionExecutorShape} */ (
      /** @type {unknown} */ ({
        name: "engine",
        simulate: (/** @type {Action} */ action) => simulate(engine, action),
        execute: (
          /** @type {Action} */ action,
          /** @type {{ readonly skipSimulation: boolean; readonly intentId?: string }} */ options,
        ) => execute(engine, action, options),
      })
    ),
  );
