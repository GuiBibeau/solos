// @ts-check
import { taggedError } from "../../shared/domain/tagged-error.js";

/** @typedef {import("../../shared/domain/tagged-error.js").TaggedErrorClass<"PortfolioInputInvalid", PortfolioInputInvalidProps>} PortfolioInputInvalidClass */
/** @typedef {{ readonly reason: string }} PortfolioInputInvalidProps */
/** Raised before any provider access; carries no owner text. */
export class PortfolioInputInvalid extends /** @type {PortfolioInputInvalidClass} */ (
  taggedError("PortfolioInputInvalid")
) {}

/**
 * Every failure a portfolio read can raise: input validation happens first, then the
 * composed venues and price feed propagate their own typed failures — a configured venue
 * that fails never silently becomes zero (ADR-0018).
 * @typedef {PortfolioInputInvalid | import("../../shared/index.js").SignerUnavailable | import("../../shared/index.js").RpcError | import("../../market/index.js").PriceFeedError | import("../../lend/index.js").LendingError | import("../../perp/index.js").PerpError | import("../../liquidity/index.js").LiquidityError} PortfolioError
 */
