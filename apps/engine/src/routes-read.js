// @ts-check
import { IntentNotFound } from "@solos/core";
import { errorResponse, json } from "./http.js";
import { readIntent } from "./intents.js";
import { ENGINE_VERSION } from "./version.js";

/**
 * @param {import("./http.js").EngineDeps} deps
 */
export const healthResponse = (deps) =>
  json(200, {
    ok: true,
    version: ENGINE_VERSION,
    tier: deps.tier,
    mode: deps.mode,
    signer: deps.signer,
    rpcHost: deps.rpcHost,
    uptimeMs: Date.now() - deps.startedAt,
  });

/**
 * @param {string} pathname
 * @param {import("./http.js").EngineDeps} deps
 */
export const intentResponse = (pathname, deps) => {
  const intentId = decodeURIComponent(pathname.slice("/v1/intents/".length));
  if (intentId.length === 0 || intentId.includes("/")) return missing(intentId);
  const row = readIntent(deps.db, intentId);
  if (row.state === "missing") return missing(intentId);
  if (row.state === "settled") return json(200, { state: "settled", result: row.result });
  if (row.state === "failed") return json(200, { state: "failed", error: row.error });
  return json(200, { state: "in_flight" });
};

/** @param {string} intentId */
const missing = (intentId) =>
  errorResponse(
    new IntentNotFound({
      intentId,
      reason: `no intent ${intentId}`,
      remedy: "check the intentId, or POST /v1/actions/execute to claim one",
    }),
  );
