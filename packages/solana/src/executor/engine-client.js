// @ts-check
import { Effect } from "effect";
import { engineErrorFromBody, engineTransportError, originOf } from "./engine-error.js";

/** @typedef {{ readonly url: string; readonly token: string }} EngineEndpoint */

/**
 * One JSON request to the engine. Redirects are not followed: the bearer token stays on the
 * origin the Operator configured. The thrown value is always a tagged domain error.
 * @param {EngineEndpoint} engine
 * @param {string} path
 * @param {{ readonly method: "GET" | "POST"; readonly body?: string; readonly timeoutMs: number }} init
 */
export const engineRequest = (engine, path, init) =>
  Effect.tryPromise({
    try: () => exchange(engine, path, init),
    catch: (error) => engineTransportError(error, engine.url),
  });

/**
 * @param {EngineEndpoint} engine
 * @param {string} path
 * @param {{ readonly body: unknown; readonly timeoutMs: number }} init
 */
export const enginePost = (engine, path, init) =>
  engineRequest(engine, path, {
    method: "POST",
    body: JSON.stringify(init.body),
    timeoutMs: init.timeoutMs,
  });

/**
 * @param {EngineEndpoint} engine
 * @param {string} path
 * @param {number} timeoutMs
 */
export const engineGet = (engine, path, timeoutMs) =>
  engineRequest(engine, path, { method: "GET", timeoutMs });

/**
 * @param {EngineEndpoint} engine
 * @param {string} path
 * @param {{ readonly method: "GET" | "POST"; readonly body?: string; readonly timeoutMs: number }} init
 */
const exchange = async (engine, path, init) => {
  const response = await fetch(endpoint(engine.url, path), {
    method: init.method,
    headers: headers(engine.token, init.body !== undefined),
    body: init.body,
    redirect: "manual",
    signal: AbortSignal.timeout(init.timeoutMs),
  });
  if (response.status >= 300 && response.status < 400) {
    throw engineErrorFromBody(undefined, engine.url);
  }
  const body = await parseBody(response);
  if (!response.ok) throw engineErrorFromBody(body, engine.url);
  return body;
};

/** @param {string} base @param {string} path */
const endpoint = (base, path) => `${originOf(base)}${path}`;

/** @param {string} token @param {boolean} json */
const headers = (token, json) => {
  /** @type {Record<string, string>} */
  const value = { accept: "application/json", authorization: `Bearer ${token}` };
  if (json) value["content-type"] = "application/json";
  return value;
};

/** @param {Response} response */
const parseBody = async (response) => {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
};
