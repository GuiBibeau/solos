// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"NoRouteFound", NoRouteFoundProps>} NoRouteFoundClass */
/** @typedef {{ readonly inputMint: string; readonly outputMint: string; readonly provider: string }} NoRouteFoundProps */
export class NoRouteFound extends /** @type {NoRouteFoundClass} */ (taggedError("NoRouteFound")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteExpired", QuoteExpiredProps>} QuoteExpiredClass */
/** @typedef {{ readonly expiresAt: number; readonly now: number }} QuoteExpiredProps */
export class QuoteExpired extends /** @type {QuoteExpiredClass} */ (taggedError("QuoteExpired")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"SwapFailed", SwapFailedProps>} SwapFailedClass */
/** @typedef {{ readonly signature: string | null; readonly reason: string }} SwapFailedProps */
export class SwapFailed extends /** @type {SwapFailedClass} */ (taggedError("SwapFailed")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteInputInvalid", QuoteInputInvalidProps>} QuoteInputInvalidClass */
/** @typedef {{ readonly reason: string }} QuoteInputInvalidProps */
/** Raised before any provider access; carries no mint or amount text beyond the fixed reason. */
export class QuoteInputInvalid extends /** @type {QuoteInputInvalidClass} */ (
  taggedError("QuoteInputInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteConfigMissing", QuoteConfigMissingProps>} QuoteConfigMissingClass */
/** @typedef {{ readonly reason: string }} QuoteConfigMissingProps */
export class QuoteConfigMissing extends /** @type {QuoteConfigMissingClass} */ (
  taggedError("QuoteConfigMissing")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteAuthFailed", QuoteAuthFailedProps>} QuoteAuthFailedClass */
/** @typedef {{ readonly status: number }} QuoteAuthFailedProps */
/** HTTP 401/403 from Jupiter: the key is absent from the account or lacks endpoint access. */
export class QuoteAuthFailed extends /** @type {QuoteAuthFailedClass} */ (
  taggedError("QuoteAuthFailed")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteRateLimited", QuoteRateLimitedProps>} QuoteRateLimitedClass */
/** @typedef {{ readonly status: number }} QuoteRateLimitedProps */
export class QuoteRateLimited extends /** @type {QuoteRateLimitedClass} */ (
  taggedError("QuoteRateLimited")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteTimeout", QuoteTimeoutProps>} QuoteTimeoutClass */
/** @typedef {{ readonly timeoutMs: number }} QuoteTimeoutProps */
export class QuoteTimeout extends /** @type {QuoteTimeoutClass} */ (taggedError("QuoteTimeout")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteHttpError", QuoteHttpErrorProps>} QuoteHttpErrorClass */
/** @typedef {{ readonly status: number; readonly reason: string }} QuoteHttpErrorProps */
export class QuoteHttpError extends /** @type {QuoteHttpErrorClass} */ (
  taggedError("QuoteHttpError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteNetworkError", QuoteNetworkErrorProps>} QuoteNetworkErrorClass */
/** @typedef {{ readonly reason: string }} QuoteNetworkErrorProps */
export class QuoteNetworkError extends /** @type {QuoteNetworkErrorClass} */ (
  taggedError("QuoteNetworkError")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteResponseInvalid", QuoteResponseInvalidProps>} QuoteResponseInvalidClass */
/** @typedef {{ readonly status: number; readonly reason: string }} QuoteResponseInvalidProps */
export class QuoteResponseInvalid extends /** @type {QuoteResponseInvalidClass} */ (
  taggedError("QuoteResponseInvalid")
) {}

/**
 * Everything the quote face of the swap provider port can fail with. Structured props only,
 * never a raw response body or the API key. The execute face keeps its own channel
 * (`SwapFailed | QuoteExpired | RpcError`) for build execution.
 * @typedef {NoRouteFound | QuoteInputInvalid | QuoteConfigMissing | QuoteAuthFailed | QuoteRateLimited | QuoteTimeout | QuoteHttpError | QuoteNetworkError | QuoteResponseInvalid} SwapQuoteError
 */
