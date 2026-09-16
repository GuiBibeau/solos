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
