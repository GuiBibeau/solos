// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PriceUnavailable", PriceUnavailableProps>} PriceUnavailableClass */
/** @typedef {{ readonly mint: string; readonly source: string; readonly reason: string }} PriceUnavailableProps */
export class PriceUnavailable extends /** @type {PriceUnavailableClass} */ (
  taggedError("PriceUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"UnknownToken", UnknownTokenProps>} UnknownTokenClass */
/** @typedef {{ readonly mint: string }} UnknownTokenProps */
export class UnknownToken extends /** @type {UnknownTokenClass} */ (taggedError("UnknownToken")) {}
