// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LendingInputInvalid", LendingInputInvalidProps>} LendingInputInvalidClass */
/** @typedef {{ readonly reason: string }} LendingInputInvalidProps */
/** Raised before any RPC; carries no address text beyond the fixed reason. */
export class LendingInputInvalid extends /** @type {LendingInputInvalidClass} */ (
  taggedError("LendingInputInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LendingMarketUnavailable", LendingMarketUnavailableProps>} LendingMarketUnavailableClass */
/** @typedef {{ readonly market: string; readonly reason: string }} LendingMarketUnavailableProps */
/** The configured lending market account is missing or not owned by the pinned program. */
export class LendingMarketUnavailable extends /** @type {LendingMarketUnavailableClass} */ (
  taggedError("LendingMarketUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"ReserveUnavailable", ReserveUnavailableProps>} ReserveUnavailableClass */
/** @typedef {{ readonly market: string; readonly mint: string; readonly reason: string }} ReserveUnavailableProps */
/** The configured market has no float-rate reserve for the mint, or its liquidity mint differs. */
export class ReserveUnavailable extends /** @type {ReserveUnavailableClass} */ (
  taggedError("ReserveUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LendingLayoutUnsupported", LendingLayoutUnsupportedProps>} LendingLayoutUnsupportedClass */
/** @typedef {{ readonly reserve: string; readonly reason: string }} LendingLayoutUnsupportedProps */
/** The reserve account exists but the pinned decoder rejects it: wrong layout or truncated bytes. Reasons are fixed text, never raw account bytes. */
export class LendingLayoutUnsupported extends /** @type {LendingLayoutUnsupportedClass} */ (
  taggedError("LendingLayoutUnsupported")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LendingResponseInvalid", LendingResponseInvalidProps>} LendingResponseInvalidClass */
/** @typedef {{ readonly reason: string }} LendingResponseInvalidProps */
/** Decoded reserve values violate the snapshot schema: out-of-range decimals or a bad APY. */
export class LendingResponseInvalid extends /** @type {LendingResponseInvalidClass} */ (
  taggedError("LendingResponseInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LendingTimeout", LendingTimeoutProps>} LendingTimeoutClass */
/** @typedef {{ readonly timeoutMs: number }} LendingTimeoutProps */
/** The whole reserve read exceeded its deadline; one attempt, no retries. */
export class LendingTimeout extends /** @type {LendingTimeoutClass} */ (
  taggedError("LendingTimeout")
) {}

/**
 * Everything the lend reserve read can fail with. `RpcError` is the shared transport error,
 * exactly as in the other slices. Structured props only — never raw account bytes or
 * provider failure bodies.
 * @typedef {LendingInputInvalid | LendingMarketUnavailable | ReserveUnavailable | LendingLayoutUnsupported | LendingResponseInvalid | LendingTimeout | import("../../shared/domain/errors.js").RpcError} LendingError
 */
