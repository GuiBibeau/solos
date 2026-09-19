// @ts-check
import { PerpAccountCorrupt, PerpStateIncomplete } from "@solos/core";
import { TRADER_PDA_INDEX } from "./phoenix-api.js";

/** @typedef {import("./phoenix-wire.js").TraderStateWire} TraderStateWire */
/** @typedef {import("./phoenix-wire.js").SubaccountWire} SubaccountWire */

/** Live Phoenix answers HTTP 404 for an unknown authority; that is a typed zero, not an error.
 * @param {string} authority
 * @returns {TraderStateWire}
 */
export const absentTraderState = (authority) => ({
  authority,
  traderPdaIndex: TRADER_PDA_INDEX,
  snapshot: {
    subaccounts: [{ subaccountIndex: TRADER_PDA_INDEX, collateral: "0", positions: [] }],
  },
});

/**
 * The MVP account scope is traderPdaIndex=0. The snapshot must echo the requested authority
 * and that index, or the response describes someone else's account.
 * @param {TraderStateWire} state
 * @param {string} authority
 * @returns {TraderStateWire}
 */
export const validateEcho = (state, authority) => {
  if (state.authority !== authority) {
    throw new PerpAccountCorrupt({
      account: authority,
      reason: "trader state names a different authority than the one requested",
    });
  }
  if (state.traderPdaIndex !== TRADER_PDA_INDEX) {
    throw new PerpAccountCorrupt({
      account: authority,
      reason: `trader state is not for traderPdaIndex ${TRADER_PDA_INDEX}`,
    });
  }
  return state;
};

/**
 * Select subaccount zero by value, never "whichever entry comes first": the array carries all
 * subaccounts of the trader PDA in no promised order.
 * @param {TraderStateWire} state
 * @returns {SubaccountWire}
 */
export const selectSubaccountZero = (state) => {
  const sub = state.snapshot.subaccounts.find(
    (entry) => entry.subaccountIndex === TRADER_PDA_INDEX,
  );
  if (sub === undefined) {
    throw new PerpStateIncomplete({ reason: "the snapshot carries no subaccount index 0" });
  }
  return /** @type {SubaccountWire} */ (sub);
};

/**
 * The read path needs the base-lot size to express exposure; metadata without it is
 * incomplete state, distinct from a broken envelope.
 * @param {import("./phoenix-wire.js").MarketConfigWire} market
 * @param {string} symbol
 * @returns {number}
 */
export const baseLotsDecimals = (market, symbol) => {
  if (market.baseLotsDecimals === undefined) {
    throw new PerpStateIncomplete({
      reason: `market metadata for ${symbol} carries no baseLotsDecimals`,
    });
  }
  return market.baseLotsDecimals;
};
