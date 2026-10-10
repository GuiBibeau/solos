// @ts-check
import { EngineUnavailable, ValidationError, errorEnvelope } from "@solos/core";
import { authorized, unauthorizedError } from "./auth.js";
import { errorResponse, json } from "./http.js";
import { executeRequest } from "./routes-execute.js";
import { healthResponse, intentResponse } from "./routes-read.js";
import { simulateRequest } from "./routes-simulate.js";

/**
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
const readRoute = (deps, pathname) => {
  if (pathname === "/v1/health") return Promise.resolve(healthResponse(deps));
  if (pathname.startsWith("/v1/intents/")) return Promise.resolve(intentResponse(pathname, deps));
  return undefined;
};

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
const postRoute = (request, deps, pathname) => {
  if (pathname === "/v1/actions/simulate") return simulateRequest(request, deps);
  if (pathname === "/v1/actions/execute") return executeRequest(request, deps);
  return undefined;
};

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
const route = (request, deps, pathname) => {
  if (pathname.startsWith("/v1/strategies")) return strategyRoute(request, deps, pathname);
  const found = matched(request, deps, pathname);
  if (found === undefined) return Promise.resolve(errorResponse(unknownRoute(pathname)));
  return found;
};

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
const strategyRoute = (request, deps, pathname) => {
  if (deps.strategyHandle === undefined) return Promise.resolve(strategiesDisabled(request));
  return deps.strategyHandle(request, deps, pathname);
};

/** Flag-off engines answer 404. Callers surface that as EngineUnavailable. @param {Request} request */
const strategiesDisabled = (request) =>
  json(404, {
    error: errorEnvelope(
      new EngineUnavailable({
        url: new URL(request.url).origin,
        reason: "strategy routes are not served by this engine",
        remedy: "start the engine with the STRATEGIES flag",
      }),
    ),
  });

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 * @param {string} pathname
 */
const matched = (request, deps, pathname) => {
  if (request.method === "GET") return readRoute(deps, pathname);
  if (request.method === "POST") return postRoute(request, deps, pathname);
  return undefined;
};

/** @param {string} pathname */
const unknownRoute = (pathname) =>
  new ValidationError({
    field: "path",
    value: pathname,
    reason: `no route ${pathname}`,
    remedy: "use /v1/health, /v1/actions/simulate, /v1/actions/execute or /v1/intents/:intentId",
  });

/**
 * @param {Request} request
 * @param {import("./http.js").EngineDeps} deps
 */
export const handleRequest = (request, deps) => {
  if (!authorized(request, deps.token)) return Promise.resolve(errorResponse(unauthorizedError()));
  return route(request, deps, new URL(request.url).pathname);
};
