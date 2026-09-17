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

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisQuestionInvalid", IrisQuestionInvalidProps>} IrisQuestionInvalidClass */
/** @typedef {{ readonly reason: string }} IrisQuestionInvalidProps */
/** Raised before any provider access; carries no question text. */
export class IrisQuestionInvalid extends /** @type {IrisQuestionInvalidClass} */ (
  taggedError("IrisQuestionInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisConfigMissing", IrisConfigMissingProps>} IrisConfigMissingClass */
/** @typedef {{ readonly reason: string }} IrisConfigMissingProps */
export class IrisConfigMissing extends /** @type {IrisConfigMissingClass} */ (
  taggedError("IrisConfigMissing")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisAuthFailed", IrisAuthFailedProps>} IrisAuthFailedClass */
/** @typedef {{ readonly status: number }} IrisAuthFailedProps */
/** HTTP 401/403 from Elfa: the key or account lacks endpoint access. */
export class IrisAuthFailed extends /** @type {IrisAuthFailedClass} */ (
  taggedError("IrisAuthFailed")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisRateLimited", IrisRateLimitedProps>} IrisRateLimitedClass */
/** @typedef {{ readonly status: number }} IrisRateLimitedProps */
export class IrisRateLimited extends /** @type {IrisRateLimitedClass} */ (
  taggedError("IrisRateLimited")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisTimeout", IrisTimeoutProps>} IrisTimeoutClass */
/** @typedef {{ readonly timeoutMs: number }} IrisTimeoutProps */
export class IrisTimeout extends /** @type {IrisTimeoutClass} */ (taggedError("IrisTimeout")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisHttpError", IrisHttpErrorProps>} IrisHttpErrorClass */
/** @typedef {{ readonly status: number; readonly reason: string }} IrisHttpErrorProps */
export class IrisHttpError extends /** @type {IrisHttpErrorClass} */ (
  taggedError("IrisHttpError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisNetworkError", IrisNetworkErrorProps>} IrisNetworkErrorClass */
/** @typedef {{ readonly reason: string }} IrisNetworkErrorProps */
export class IrisNetworkError extends /** @type {IrisNetworkErrorClass} */ (
  taggedError("IrisNetworkError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisResponseInvalid", IrisResponseInvalidProps>} IrisResponseInvalidClass */
/** @typedef {{ readonly status: number; readonly reason: string }} IrisResponseInvalidProps */
export class IrisResponseInvalid extends /** @type {IrisResponseInvalidClass} */ (
  taggedError("IrisResponseInvalid")
) {}

/**
 * Everything the market-intelligence port can fail with. Structured props only, never a raw
 * response body or the API key.
 * @typedef {IrisInputInvalid | IrisQuestionInvalid | IrisConfigMissing | IrisAuthFailed | IrisRateLimited | IrisTimeout | IrisHttpError | IrisNetworkError | IrisResponseInvalid} IrisError
 */

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"IrisInputInvalid", { readonly reason: string }>} IrisInputInvalidClass */
export class IrisInputInvalid extends /** @type {IrisInputInvalidClass} */ (
  taggedError("IrisInputInvalid")
) {}
