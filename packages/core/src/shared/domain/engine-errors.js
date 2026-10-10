// @ts-check
import { taggedError } from "./tagged-error.js";

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"EngineConfigMissing", EngineConfigMissingProps>} EngineConfigMissingClass */
/** @typedef {{ readonly reason: string }} EngineConfigMissingProps */
/** `SOLOS_EXECUTOR=engine` without the URL or the token. Names the variable, like `RpcConfigMissing`. */
export class EngineConfigMissing extends /** @type {EngineConfigMissingClass} */ (
  taggedError("EngineConfigMissing")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"EngineUnavailable", EngineUnavailableProps>} EngineUnavailableClass */
/** @typedef {{ readonly url: string; readonly reason: string }} EngineUnavailableProps */
/** The engine did not answer, or answered with a code this process does not know. */
export class EngineUnavailable extends /** @type {EngineUnavailableClass} */ (
  taggedError("EngineUnavailable")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"EngineUnauthorized", EngineUnauthorizedProps>} EngineUnauthorizedClass */
/** @typedef {{ readonly reason: string }} EngineUnauthorizedProps */
/** The bearer token was missing or did not match. The token value is never part of this error. */
export class EngineUnauthorized extends /** @type {EngineUnauthorizedClass} */ (
  taggedError("EngineUnauthorized")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"TierWithheld", TierWithheldProps>} TierWithheldClass */
/** @typedef {{ readonly tier: string; readonly reason: string }} TierWithheldProps */
/** The engine's tier ceiling refused the request. */
export class TierWithheld extends /** @type {TierWithheldClass} */ (taggedError("TierWithheld")) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"IntentInFlight", IntentInFlightProps>} IntentInFlightClass */
/** @typedef {{ readonly intentId: string; readonly reason: string }} IntentInFlightProps */
/** A repeat arrived while the first execution of this Intent was still running. */
export class IntentInFlight extends /** @type {IntentInFlightClass} */ (
  taggedError("IntentInFlight")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"IntentNotFound", IntentNotFoundProps>} IntentNotFoundClass */
/** @typedef {{ readonly intentId: string; readonly reason: string }} IntentNotFoundProps */
/** No Intent with this id has been claimed. */
export class IntentNotFound extends /** @type {IntentNotFoundClass} */ (
  taggedError("IntentNotFound")
) {}

/** @typedef {import("./tagged-error.js").TaggedErrorClass<"SurfpoolUnavailable", SurfpoolUnavailableProps>} SurfpoolUnavailableClass */
/** @typedef {{ readonly reason: string }} SurfpoolUnavailableProps */
/** Paper mode could not start Surfpool. */
export class SurfpoolUnavailable extends /** @type {SurfpoolUnavailableClass} */ (
  taggedError("SurfpoolUnavailable")
) {}
