// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpInputInvalid", PerpInputInvalidProps>} PerpInputInvalidClass */
/** @typedef {{ readonly reason: string }} PerpInputInvalidProps */
/** Raised before any provider access; carries no market text. */
export class PerpInputInvalid extends /** @type {PerpInputInvalidClass} */ (
  taggedError("PerpInputInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"NoPositionToClose", NoPositionToCloseProps>} NoPositionToCloseClass */
/** @typedef {{ readonly market: string }} NoPositionToCloseProps */
/** A requested reduce-only close has no position to reduce; never fabricate a signature. */
export class NoPositionToClose extends /** @type {NoPositionToCloseClass} */ (
  taggedError("NoPositionToClose")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpMarketUnknown", PerpMarketUnknownProps>} PerpMarketUnknownClass */
/** @typedef {{ readonly market: string }} PerpMarketUnknownProps */
/** The normalized symbol is absent from the exchange metadata. */
export class PerpMarketUnknown extends /** @type {PerpMarketUnknownClass} */ (
  taggedError("PerpMarketUnknown")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpAccountCorrupt", PerpAccountCorruptProps>} PerpAccountCorruptClass */
/** @typedef {{ readonly account: string; readonly reason: string }} PerpAccountCorruptProps */
/** The snapshot contradicts the request (authority/index echo) or carries unreadable amounts. */
export class PerpAccountCorrupt extends /** @type {PerpAccountCorruptClass} */ (
  taggedError("PerpAccountCorrupt")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpStateIncomplete", PerpStateIncompleteProps>} PerpStateIncompleteClass */
/** @typedef {{ readonly reason: string }} PerpStateIncompleteProps */
/** A read the contract requires is missing: no subaccount zero, or metadata without lot sizes. */
export class PerpStateIncomplete extends /** @type {PerpStateIncompleteClass} */ (
  taggedError("PerpStateIncomplete")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpEnumerationIncomplete", PerpEnumerationIncompleteProps>} PerpEnumerationIncompleteClass */
/** @typedef {{ readonly reason: string }} PerpEnumerationIncompleteProps */
/** An enumeration bound was reached; a partial array is never returned (ADR-0018). */
export class PerpEnumerationIncomplete extends /** @type {PerpEnumerationIncompleteClass} */ (
  taggedError("PerpEnumerationIncomplete")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpAuthFailed", PerpAuthFailedProps>} PerpAuthFailedClass */
/** @typedef {{ readonly status: number }} PerpAuthFailedProps */
export class PerpAuthFailed extends /** @type {PerpAuthFailedClass} */ (
  taggedError("PerpAuthFailed")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpRateLimited", PerpRateLimitedProps>} PerpRateLimitedClass */
/** @typedef {{ readonly status: number }} PerpRateLimitedProps */
/** HTTP 429 maps here once; there is no Retry-After retry loop. */
export class PerpRateLimited extends /** @type {PerpRateLimitedClass} */ (
  taggedError("PerpRateLimited")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpTimeout", PerpTimeoutProps>} PerpTimeoutClass */
/** @typedef {{ readonly timeoutMs: number }} PerpTimeoutProps */
export class PerpTimeout extends /** @type {PerpTimeoutClass} */ (taggedError("PerpTimeout")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpHttpError", PerpHttpErrorProps>} PerpHttpErrorClass */
/** @typedef {{ readonly status: number; readonly reason: string }} PerpHttpErrorProps */
export class PerpHttpError extends /** @type {PerpHttpErrorClass} */ (
  taggedError("PerpHttpError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpNetworkError", PerpNetworkErrorProps>} PerpNetworkErrorClass */
/** @typedef {{ readonly reason: string }} PerpNetworkErrorProps */
export class PerpNetworkError extends /** @type {PerpNetworkErrorClass} */ (
  taggedError("PerpNetworkError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PerpResponseInvalid", PerpResponseInvalidProps>} PerpResponseInvalidClass */
/** @typedef {{ readonly status: number; readonly reason: string }} PerpResponseInvalidProps */
export class PerpResponseInvalid extends /** @type {PerpResponseInvalidClass} */ (
  taggedError("PerpResponseInvalid")
) {}

/**
 * Everything the PerpVenue port can fail with. Structured props only, never a raw response
 * body or a credential. Unknown market, an unavailable provider, a corrupt account and
 * incomplete state stay distinct, so callers can tell a bad symbol from a broken venue.
 * @typedef {PerpInputInvalid | PerpMarketUnknown | PerpAccountCorrupt | PerpStateIncomplete | PerpEnumerationIncomplete | PerpAuthFailed | PerpRateLimited | PerpTimeout | PerpHttpError | PerpNetworkError | PerpResponseInvalid} PerpError
 */
