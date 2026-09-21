// @ts-check
import { Context } from "effect";

/**
 * The supported-portfolio read model (ADR-0018): one owner's cash, positions and perp
 * account equity assembled from the wallet balance reader, the price feed and the optional
 * venue enumerations. Read-only: no pricing opinion beyond observed prices, no debt
 * accounting, no background cache.
 * @typedef {{
 *   readonly getState: (request: { readonly owner: import("../../shared/domain/address.js").Address }) =>
 *     import("effect").Effect.Effect<import("@solos/actions").PortfolioState, import("../domain/errors.js").PortfolioError>;
 * }} PortfolioReaderShape
 */

export const PortfolioReader =
  /** @type {Context.Tag<PortfolioReaderShape, PortfolioReaderShape>} */ (
    Context.GenericTag("@solos/portfolio/PortfolioReader")
  );
