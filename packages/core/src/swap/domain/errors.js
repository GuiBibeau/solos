// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"NoRouteFound", NoRouteFoundProps>} NoRouteFoundClass */
/** @typedef {{ readonly inputMint: string; readonly outputMint: string; readonly provider: string; readonly reason?: string }} NoRouteFoundProps */
/** No route exists for the pair. No remedy: there is nothing for the caller to change. */
export class NoRouteFound extends /** @type {NoRouteFoundClass} */ (taggedError("NoRouteFound")) {
  /** @param {NoRouteFoundProps} props */
  constructor(props) {
    super({
      ...props,
      reason:
        props.reason ??
        `${props.provider} found no route from ${props.inputMint} to ${props.outputMint}`,
    });
  }
}

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
/** @typedef {{ readonly status: number; readonly reason?: string }} QuoteAuthFailedProps */
/** HTTP 401/403 from Jupiter: the key is absent from the account or lacks endpoint access. */
export class QuoteAuthFailed extends /** @type {QuoteAuthFailedClass} */ (
  taggedError("QuoteAuthFailed")
) {
  /** @param {QuoteAuthFailedProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `Jupiter rejected the API key with HTTP ${props.status}`,
      remedy: "set JUPITER_API_KEY to a key with Swap access from https://portal.jup.ag",
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteRateLimited", QuoteRateLimitedProps>} QuoteRateLimitedClass */
/** @typedef {{ readonly status: number; readonly reason?: string }} QuoteRateLimitedProps */
/** HTTP 429. No remedy: waiting is not an argument, a tool, or a command the caller can pass. */
export class QuoteRateLimited extends /** @type {QuoteRateLimitedClass} */ (
  taggedError("QuoteRateLimited")
) {
  /** @param {QuoteRateLimitedProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `Jupiter rate limited the request with HTTP ${props.status}`,
    });
  }
}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"QuoteTimeout", QuoteTimeoutProps>} QuoteTimeoutClass */
/** @typedef {{ readonly timeoutMs: number; readonly reason?: string }} QuoteTimeoutProps */
/** No answer inside the deadline. No remedy: retrying is not an argument, a tool, or a command. */
export class QuoteTimeout extends /** @type {QuoteTimeoutClass} */ (taggedError("QuoteTimeout")) {
  /** @param {QuoteTimeoutProps} props */
  constructor(props) {
    super({
      ...props,
      reason: props.reason ?? `Jupiter did not answer within ${props.timeoutMs}ms`,
    });
  }
}

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
 * Everything the swap provider's quote face can fail with. Structured props only, never a raw
 * response body or the API key. Execution does not run through this port: execute-tier use cases
 * build an Action and call the shared ActionExecutor (ADR-0013).
 * @typedef {NoRouteFound | QuoteInputInvalid | QuoteConfigMissing | QuoteAuthFailed | QuoteRateLimited | QuoteTimeout | QuoteHttpError | QuoteNetworkError | QuoteResponseInvalid} SwapQuoteError
 */
