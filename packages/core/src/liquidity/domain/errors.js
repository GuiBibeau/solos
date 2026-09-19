// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LiquidityInputInvalid", LiquidityInputInvalidProps>} LiquidityInputInvalidClass */
/** @typedef {{ readonly reason: string }} LiquidityInputInvalidProps */
/** Raised before any network access; includes protocol values outside the venue enum. */
export class LiquidityInputInvalid extends /** @type {LiquidityInputInvalidClass} */ (
  taggedError("LiquidityInputInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LiquidityUnsupportedProtocol", LiquidityUnsupportedProtocolProps>} LiquidityUnsupportedProtocolClass */
/** @typedef {{ readonly protocol: string }} LiquidityUnsupportedProtocolProps */
/** The protocol is enum-valid but has no adapter yet; raised before the network, always. */
export class LiquidityUnsupportedProtocol extends /** @type {LiquidityUnsupportedProtocolClass} */ (
  taggedError("LiquidityUnsupportedProtocol")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LiquidityPositionUnavailable", LiquidityPositionUnavailableProps>} LiquidityPositionUnavailableClass */
/** @typedef {{ readonly position: string; readonly reason: string }} LiquidityPositionUnavailableProps */
/**
 * The position account is absent, not owned by the pinned Whirlpool program, laid out
 * wrongly (corrupt state), foreign-owned (no position NFT custody), or references a pool
 * that is missing or corrupt. Never a fabricated zero holding.
 */
export class LiquidityPositionUnavailable extends /** @type {LiquidityPositionUnavailableClass} */ (
  taggedError("LiquidityPositionUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"LiquidityEnumerationIncomplete", LiquidityEnumerationIncompleteProps>} LiquidityEnumerationIncompleteClass */
/** @typedef {{ readonly reason: string }} LiquidityEnumerationIncompleteProps */
/** An enumeration bound was reached; a partial array is never returned (ADR-0018). */
export class LiquidityEnumerationIncomplete extends /** @type {LiquidityEnumerationIncompleteClass} */ (
  taggedError("LiquidityEnumerationIncomplete")
) {}

/**
 * Everything the LiquidityVenue port can fail with. Structured props only, never raw chain or
 * library output. A missing account, a corrupt account and a foreign-owned position stay
 * distinct from input and protocol rejections, so callers can tell a bad address from a
 * broken venue.
 * @typedef {LiquidityInputInvalid | LiquidityUnsupportedProtocol | LiquidityPositionUnavailable | LiquidityEnumerationIncomplete} LiquidityError
 */
