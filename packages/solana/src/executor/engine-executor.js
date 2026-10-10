// @ts-check
import path from "node:path";
import { ActionExecutor, EngineUnavailable } from "@solos/core";
import { ExecutionResultSchema, SimulationResultSchema } from "@solos-sh/actions";
import { Effect, Layer } from "effect";
import { configDir } from "../credentials/paths.js";
import {
  actionFingerprint,
  callerIntentId,
  forgetCallerIntent,
  rememberCallerIntent,
} from "./caller-intent.js";
import { enginePost } from "./engine-client.js";
import { originOf } from "./engine-error.js";

const SIMULATE_TIMEOUT_MS = 30_000;
/** Confirmation on the engine can take the slow-mode deadline (75s) plus a margin. */
const EXECUTE_TIMEOUT_MS = 90_000;

/** @typedef {import("./engine-client.js").EngineEndpoint & { readonly intentFile?: string }} EngineCaller */
/** @typedef {import("@solos-sh/actions").Action} Action */
/**
 * @typedef {{
 *   readonly intentId: string;
 *   readonly file?: string;
 *   readonly fingerprint?: string;
 * }} TrackedIntent
 */

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

/** @param {EngineCaller} engine */
const intentFileOf = (engine) =>
  engine.intentFile ??
  path.join(
    configDir(/** @type {Record<string, string | undefined>} */ (process.env)),
    "engine-intents.sqlite",
  );

/**
 * An explicit id is that Intent. Otherwise the id is the one already open for this action, so a
 * CLI or MCP retry of a lost response does not mint a second Intent.
 * @param {EngineCaller} engine
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean; readonly intentId?: string }} options
 * @returns {TrackedIntent}
 */
const trackIntent = (engine, action, options) => {
  if (options.intentId !== undefined && options.intentId.length > 0) {
    return { intentId: options.intentId };
  }
  const file = intentFileOf(engine);
  const fingerprint = actionFingerprint(action, options.skipSimulation);
  return { intentId: callerIntentId(file, fingerprint), file, fingerprint };
};

/**
 * A terminal answer closes the row. A lost response or an in-flight duplicate keeps the id.
 * @param {TrackedIntent} tracked
 * @param {unknown} [error]
 */
const settleTrack = (tracked, error) => {
  if (tracked.file === undefined || tracked.fingerprint === undefined) return;
  const tag = tagOf(error);
  if (tag === "EngineUnavailable") return;
  if (tag === "IntentInFlight") {
    rememberCallerIntent(tracked.file, tracked.fingerprint, tracked.intentId);
    return;
  }
  forgetCallerIntent(tracked.file, tracked.fingerprint);
};

/** @param {unknown} error */
const tagOf = (error) =>
  typeof error === "object" && error !== null && "_tag" in error ? String(error._tag) : "";

/**
 * @param {EngineCaller} engine
 * @param {Action} action
 */
const simulate = (engine, action) =>
  enginePost(engine, "/v1/actions/simulate", {
    body: { action },
    timeoutMs: SIMULATE_TIMEOUT_MS,
  }).pipe(Effect.flatMap((body) => decodeResult(SimulationResultSchema, body, engine.url)));

/**
 * @param {EngineCaller} engine
 * @param {Action} action
 * @param {{ readonly skipSimulation: boolean; readonly intentId?: string }} options
 */
const execute = (engine, action, options) => {
  const tracked = trackIntent(engine, action, options);
  return enginePost(engine, "/v1/actions/execute", {
    body: {
      action,
      intentId: tracked.intentId,
      skipSimulation: options.skipSimulation,
    },
    timeoutMs: EXECUTE_TIMEOUT_MS,
  }).pipe(
    Effect.flatMap((body) => decodeResult(ExecutionResultSchema, body, engine.url)),
    Effect.tap(() => Effect.sync(() => settleTrack(tracked))),
    Effect.tapError((error) => Effect.sync(() => settleTrack(tracked, error))),
  );
};

/**
 * `ActionExecutor` over HTTP. Nothing above the port learns that execution left the process.
 * CLI and MCP both use this adapter, so both retries share the caller intent file.
 * @param {EngineCaller} engine
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
