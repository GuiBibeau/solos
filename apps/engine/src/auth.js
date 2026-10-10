// @ts-check
import { timingSafeEqual } from "node:crypto";
import { EngineUnauthorized } from "@solos/core";

const BEARER = "Bearer ";

/**
 * Every route, health included, requires the bearer token. The presented value is never logged.
 * @param {Request} request
 * @param {string} token
 */
export const authorized = (request, token) => {
  const header = request.headers.get("authorization");
  if (header === null || !header.startsWith(BEARER)) return false;
  return safeEqual(header.slice(BEARER.length), token);
};

/** Missing or wrong token. The body does not echo what was sent. */
export const unauthorizedError = () =>
  new EngineUnauthorized({
    reason: "missing or wrong bearer token",
    remedy: "send Authorization: Bearer with the SOLOS_ENGINE_TOKEN the engine was started with",
  });

/**
 * @param {string} left
 * @param {string} right
 */
const safeEqual = (left, right) => {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
};
