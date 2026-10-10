// @ts-check
import { EngineUnavailable, domainErrors } from "@solos/core";

/**
 * Rebuild a tagged domain error from the engine's `{ error: { code, ... } }` body. An unknown
 * code, or a body that is not that envelope, becomes `EngineUnavailable`. `url` is the origin
 * only: a path or query on the configured URL never rides along.
 * @param {unknown} body
 * @param {string} url
 */
export const engineErrorFromBody = (body, url) => {
  const origin = originOf(url);
  const error = errorRecord(body);
  if (error === undefined || typeof error.code !== "string") return unavailable(origin);
  const found = domainErrors().find((entry) => entry.tag === error.code);
  if (found === undefined) {
    const reason = typeof error.reason === "string" ? error.reason : `unknown code ${error.code}`;
    return new EngineUnavailable({
      url: origin,
      reason,
      remedy: "upgrade the caller so it understands this engine error",
    });
  }
  const props = Object.fromEntries(Object.entries(error).filter(([key]) => key !== "code"));
  return new found.ErrorClass(props);
};

/**
 * Transport failures and anything that is not already a tagged error.
 * @param {unknown} error
 * @param {string} url
 */
export const engineTransportError = (error, url) => {
  if (isTagged(error)) return error;
  return new EngineUnavailable({
    url: originOf(url),
    reason: "the engine did not answer",
    remedy: "check that the engine is running and SOLOS_ENGINE_URL is its origin",
  });
};

/** @param {string} url */
export const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch {
    return "<unparseable engine url>";
  }
};

/** @param {string} origin */
const unavailable = (origin) =>
  new EngineUnavailable({
    url: origin,
    reason: "the engine returned a response that was not an error envelope",
    remedy: "check that SOLOS_ENGINE_URL points at the solOS engine",
  });

/** @param {unknown} body */
const errorRecord = (body) => {
  if (typeof body !== "object" || body === null || !("error" in body)) return undefined;
  const error = /** @type {{ error?: unknown }} */ (body).error;
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return /** @type {{ code?: unknown; reason?: unknown } & Record<string, unknown>} */ (error);
};

/** @param {unknown} error */
const isTagged = (error) =>
  typeof error === "object" && error !== null && "_tag" in error && typeof error._tag === "string";
