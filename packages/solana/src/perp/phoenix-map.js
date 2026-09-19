// @ts-check
import {
  PerpAccountSchema,
  PerpPositionSchema,
  PerpAccountCorrupt,
  PerpEnumerationIncomplete,
  PerpStateIncomplete,
  equityUsdFromSubaccount,
  parseLots,
  sideFromLots,
} from "@solos/core";
import { baseLotsDecimals, selectSubaccountZero, validateEcho } from "./phoenix-snapshot.js";

/** @typedef {import("@solos/core").PerpPosition} PerpPosition */
/** @typedef {import("@solos/core").PerpAccount} PerpAccount */
/** @typedef {import("@solos/core").GetPositionResult} GetPositionResult */
/** @typedef {import("@solos/core").PerpEnumeration} PerpEnumeration */
/** @typedef {import("./phoenix-wire.js").MarketConfigWire} MarketConfigWire */
/** @typedef {import("./phoenix-wire.js").PositionRowWire} PositionRowWire */
/** @typedef {import("./phoenix-wire.js").SubaccountWire} SubaccountWire */
/** @typedef {import("./phoenix-wire.js").TraderStateWire} TraderStateWire */

/** ADR-0018: reaching a truncation bound is an explicit failure, never a partial success. */
export const MAX_ENUMERATION_POSITIONS = 256;

/**
 * Account identity is the authority address: the trader-state wire exposes no derived trader
 * PDA, and with traderPdaIndex fixed to 0 the mapping authority ↔ trader account is 1:1, so
 * identity stays unique per owner. Swapping to the true PDA later is an adapter-internal change.
 */

/** @param {string} account @param {string} text @returns {bigint} */
const lotsOrCorrupt = (account, text) => {
  try {
    return parseLots(text);
  } catch {
    throw new PerpAccountCorrupt({
      account,
      reason: "a lot figure is not a signed integer lot string",
    });
  }
};

/**
 * One row to the contract shape: side from the sign, absolute base lots as the amount, market
 * decimals, and valueUsd null (never leveraged notional). A zero-lots residual row is flat.
 * @param {PositionRowWire} row
 * @param {number} decimals
 * @param {string} account
 * @returns {PerpPosition}
 */
const positionFromRow = (row, decimals, account) => {
  const lots = lotsOrCorrupt(account, row.basePositionLots);
  return PerpPositionSchema.parse({
    kind: "perp",
    protocol: "phoenix",
    account,
    instrument: row.symbol,
    side: sideFromLots(lots),
    amount: (lots < 0n ? -lots : lots).toString(),
    decimals,
    valueUsd: null,
  });
};

/**
 * The shared account equity record, counted once per trader account. Open positions are rows
 * with nonzero lots; a residual zero row keeps the collateral-derived equity path intact.
 * @param {SubaccountWire} sub
 * @param {string} account
 * @returns {PerpAccount}
 */
const accountFromSubaccount = (sub, account) => {
  let openPositions = 0;
  for (const row of sub.positions) {
    if (lotsOrCorrupt(account, row.basePositionLots) !== 0n) openPositions += 1;
  }
  const equityUsd = equityUsdFromSubaccount({
    collateral: lotsOrCorrupt(account, sub.collateral),
    openPositionCount: openPositions,
    spotCollateralCount: sub.spotCollaterals?.length ?? 0,
  });
  return PerpAccountSchema.parse({ protocol: "phoenix", account, equityUsd });
};

/**
 * Point read: `{position, account}` (ADR-0021). No row for the market is a typed flat success.
 * @param {{ readonly authority: string; readonly market: MarketConfigWire; readonly state: TraderStateWire }} args
 * @returns {GetPositionResult}
 */
export const mapPointRead = ({ authority, market, state }) => {
  validateEcho(state, authority);
  const sub = selectSubaccountZero(state, authority);
  const decimals = baseLotsDecimals(market, market.symbol);
  const row = sub.positions.find((entry) => entry.symbol === market.symbol);
  const position =
    row === undefined ? positionFromRow({ symbol: market.symbol, basePositionLots: "0" }, decimals, authority) : positionFromRow(row, decimals, authority);
  return { position, account: accountFromSubaccount(sub, authority) };
};

/**
 * Complete enumeration (ADR-0018): every open position across markets plus the account equity
 * exactly once, even when flat. An unknown market inside the snapshot fails the whole read.
 * @param {{ readonly authority: string; readonly markets: MarketConfigWire[]; readonly state: TraderStateWire }} args
 * @returns {PerpEnumeration}
 */
export const mapEnumeration = ({ authority, markets, state }) => {
  validateEcho(state, authority);
  const sub = selectSubaccountZero(state, authority);
  const open = sub.positions.filter((row) => lotsOrCorrupt(authority, row.basePositionLots) !== 0n);
  if (open.length > MAX_ENUMERATION_POSITIONS) {
    throw new PerpEnumerationIncomplete({
      reason: `the account holds more than ${MAX_ENUMERATION_POSITIONS} open positions`,
    });
  }
  const bySymbol = new Map(markets.map((market) => [market.symbol, market]));
  const positions = open.map((row) => {
    const market = bySymbol.get(row.symbol);
    if (market === undefined) {
      throw new PerpStateIncomplete({
        reason: "the snapshot holds a position in a market absent from the exchange metadata",
      });
    }
    return positionFromRow(row, baseLotsDecimals(market, row.symbol), authority);
  });
  return { positions, perpAccounts: [accountFromSubaccount(sub, authority)], receiptMints: [] };
};
