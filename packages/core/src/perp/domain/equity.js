// @ts-check
import { quoteLotsToUsd } from "./lots.js";

/**
 * Account equity under the complete-or-null rule (ADR-0021). The trader-state snapshot carries
 * collateral and open exposure but no mark price, so:
 *
 * - any open position ⇒ null: unrealized PnL and funding are unknowable from this snapshot;
 * - any nonzero spot collateral ⇒ null: spot balances are valued off-snapshot (haircuts, index prices);
 * - otherwise equity equals the exact collateral (nothing is open, so nothing is unvalued):
 *   the cold/absent trader therefore gets the confirmed zero, `"0"`.
 *
 * Equity is signed USD or null — never guessed collateral, never leveraged notional.
 * @param {{
 *   readonly collateral: bigint;
 *   readonly openPositionCount: number;
 *   readonly spotCollateralCount: number;
 * }} subaccount
 * @returns {string | null}
 */
export const equityUsdFromSubaccount = ({ collateral, openPositionCount, spotCollateralCount }) => {
  if (openPositionCount > 0 || spotCollateralCount > 0) return null;
  return quoteLotsToUsd(collateral);
};
