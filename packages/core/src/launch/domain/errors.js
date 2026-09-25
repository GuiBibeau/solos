// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"CurveInputInvalid", CurveInputInvalidProps>} CurveInputInvalidClass */
/** @typedef {{ readonly reason: string }} CurveInputInvalidProps */
/** Raised before any RPC; carries no address text beyond the fixed reason. */
export class CurveInputInvalid extends /** @type {CurveInputInvalidClass} */ (
  taggedError("CurveInputInvalid")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"CurveUnavailable", CurveUnavailableProps>} CurveUnavailableClass */
/** @typedef {{ readonly mint: string; readonly curveAddress: string }} CurveUnavailableProps */
/** No account exists at the bonding-curve PDA: the mint has no curve yet. */
export class CurveUnavailable extends /** @type {CurveUnavailableClass} */ (
  taggedError("CurveUnavailable")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"CurveCorrupt", CurveCorruptProps>} CurveCorruptClass */
/** @typedef {{ readonly mint: string; readonly curveAddress: string; readonly reason: string }} CurveCorruptProps */
/** The account at the PDA is not a readable curve of the pinned program: wrong owner, wrong discriminator, or truncated bytes. Reasons are fixed text, never raw account bytes. */
export class CurveCorrupt extends /** @type {CurveCorruptClass} */ (taggedError("CurveCorrupt")) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"UnsupportedQuoteAsset", UnsupportedQuoteAssetProps>} UnsupportedQuoteAssetClass */
/** @typedef {{ readonly mint: string; readonly quoteMint: string }} UnsupportedQuoteAssetProps */
/** The curve trades against a quote asset other than native SOL; only SOL-paired curves are supported. */
export class UnsupportedQuoteAsset extends /** @type {UnsupportedQuoteAssetClass} */ (
  taggedError("UnsupportedQuoteAsset")
) {}

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"CurveConfigUnavailable", CurveConfigUnavailableProps>} CurveConfigUnavailableClass */
/** @typedef {{ readonly reason: string }} CurveConfigUnavailableProps */
/** The protocol Global config needed for progress is absent or unreadable; progress is never guessed from a constant. */
export class CurveConfigUnavailable extends /** @type {CurveConfigUnavailableClass} */ (
  taggedError("CurveConfigUnavailable")
) {}

/**
 * Everything the launch curve read can fail with. `RpcError` is the shared transport error,
 * exactly as in the market slice. Structured props only — never raw account bytes or
 * provider failure bodies.
 * @typedef {CurveInputInvalid | CurveUnavailable | CurveCorrupt | UnsupportedQuoteAsset | CurveConfigUnavailable | import("../../shared/domain/errors.js").RpcError} LaunchCurveError
 */

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"CurveComplete", CurveCompleteProps>} CurveCompleteClass */
/** @typedef {{ readonly mint: string; readonly curveAddress: string }} CurveCompleteProps */
/** The curve has completed and no longer trades. Buying is refused here and never rerouted to PumpSwap or Jupiter. */
export class CurveComplete extends /** @type {CurveCompleteClass} */ (
  taggedError("CurveComplete")
) {}

/**
 * Everything a launch buy can fail with before the executor is involved; the execute tier adds
 * the shared executor errors on top.
 * @typedef {CurveInputInvalid | CurveComplete | UnsupportedQuoteAsset | LaunchCurveError} LaunchBuyError
 */
