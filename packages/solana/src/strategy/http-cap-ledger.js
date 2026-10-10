// @ts-check
import { CapLedger, EngineUnavailable } from "@solos/core";
import { Effect, Layer } from "effect";
import { engineGet, enginePost } from "../executor/engine-client.js";

const TIMEOUT_MS = 10_000;

/**
 * Cap ledger adapter for the CLI and the MCP server. Engage, disengage, and status go to the
 * Engine. A reservation is taken only when an Action executes under a Strategy.
 * @param {{ readonly url: string; readonly token: string }} engine
 */
export const HttpCapLedger = (engine) =>
  Layer.sync(
    CapLedger,
    () =>
      /** @type {import("@solos/core/strategy").CapLedgerShape} */ (
        /** @type {unknown} */ (service(engine))
      ),
  );

/**
 * @param {{ readonly url: string; readonly token: string }} engine
 */
const service = (engine) => ({
  reserve: () => heldOnEngine(engine),
  settle: () => heldOnEngine(engine),
  release: () => heldOnEngine(engine),
  engage: (/** @type {{ scope: string; reason: string }} */ input) =>
    enginePost(engine, "/v1/strategies/kill", { body: input, timeoutMs: TIMEOUT_MS }).pipe(
      Effect.asVoid,
    ),
  disengage: (/** @type {string} */ scope) =>
    enginePost(engine, "/v1/strategies/kill/disengage", {
      body: { scope },
      timeoutMs: TIMEOUT_MS,
    }).pipe(Effect.asVoid),
  status: (/** @type {string} */ scope) =>
    engineGet(engine, `/v1/strategies/kill?scope=${encodeURIComponent(scope)}`, TIMEOUT_MS).pipe(
      Effect.map(statusOf),
    ),
});

/** @param {{ readonly url: string }} engine */
const heldOnEngine = (engine) =>
  Effect.fail(
    new EngineUnavailable({
      url: engine.url,
      reason: "a reservation is taken on the Engine when an Action executes",
      remedy: "POST /v1/actions/execute with strategyId and tickId",
    }),
  );

/** @param {unknown} body */
const statusOf = (body) => {
  const row = /** @type {{ engaged?: boolean; reason?: string | null }} */ (body);
  return {
    engaged: row.engaged === true,
    reason: typeof row.reason === "string" ? row.reason : null,
  };
};
