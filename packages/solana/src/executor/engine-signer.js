// @ts-check
import { Signer, SignerUnavailable } from "@solos/core";
import { Effect, Layer } from "effect";
import { engineGet } from "./engine-client.js";

const HEALTH_TIMEOUT_MS = 5000;

/**
 * The Caller's `Signer` port when the key lives on the engine: address only, read from
 * `/v1/health`. Key material never crosses.
 * @param {import("./engine-client.js").EngineEndpoint} engine
 */
export const EngineSigner = (engine) => {
  /** @type {string | undefined} */
  let cached;
  return Layer.succeed(Signer, {
    backend: "engine",
    address: () =>
      cached === undefined
        ? readAddress(engine, (value) => (cached = value))
        : Effect.succeed(cached),
  });
};

/**
 * @param {import("./engine-client.js").EngineEndpoint} engine
 * @param {(address: string) => void} remember
 */
const readAddress = (engine, remember) =>
  engineGet(engine, "/v1/health", HEALTH_TIMEOUT_MS).pipe(
    Effect.mapError(() => unavailable()),
    Effect.flatMap((body) => {
      const signer = signerOf(body);
      if (signer === undefined) return Effect.fail(unavailable());
      remember(signer);
      return Effect.succeed(signer);
    }),
  );

/** @param {unknown} body */
const signerOf = (body) => {
  if (typeof body !== "object" || body === null || !("signer" in body)) return undefined;
  const signer = /** @type {{ signer?: unknown }} */ (body).signer;
  return typeof signer === "string" && signer.length > 0 ? signer : undefined;
};

const unavailable = () =>
  new SignerUnavailable({
    backend: "engine",
    reason: "the engine did not answer with its signer address",
    remedy: "check that the engine is running and SOLOS_ENGINE_URL is its origin",
  });
