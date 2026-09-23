// @ts-check
import { none, some } from "@solana/kit";
import { KLEND_PROGRAM_ID } from "./kamino-addresses.js";

/** @typedef {{ pythOracle: string | null; switchboardPriceOracle: string | null; switchboardTwapOracle: string | null; scopePrices: string | null }} ReserveOracles */

/**
 * Mirror the pinned SDK's optionalAccount rule for zero/default and null pubkeys. The
 * configured reserve, not the caller, decides which oracle account each refresh uses.
 * @param {string | null} value
 */
const oracleOption = (value) =>
  value === null ? none() : some(/** @type {import("@solana/kit").Address} */ (value));

/**
 * The refresh instruction always carries all configured oracle identities in SDK order.
 * @param {any} sdk
 * @param {{ market: string; reserve: string; oracles: ReserveOracles }} facts
 */
export const refreshReserveInstruction = (sdk, facts) =>
  sdk.refreshReserve(
    {
      reserve: facts.reserve,
      lendingMarket: facts.market,
      pythOracle: oracleOption(facts.oracles.pythOracle),
      switchboardPriceOracle: oracleOption(facts.oracles.switchboardPriceOracle),
      switchboardTwapOracle: oracleOption(facts.oracles.switchboardTwapOracle),
      scopePrices: oracleOption(facts.oracles.scopePrices),
    },
    [],
    /** @type {any} */ (KLEND_PROGRAM_ID),
  );
