// @ts-check
/**
 * Address-level curve fixtures shared by the loopback JSON-RPC test servers: a pure
 * `address -> raw account` map over the same fixture family the Surfnet seeding writes. Bytes
 * come from `test-fixtures.js`; the pump program is never invoked.
 */
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import { bondingCurveAddress } from "./bonding-curve.js";
import { globalConfigAddress } from "./global-config.js";
import { PUMP_PROGRAM } from "./pump-program.js";
import { freshCurveBytes, globalConfigBytes } from "./test-fixtures.js";

/** A curve trading against USDC instead of native SOL: outside the SOL-only MVP. */
export const USDC_QUOTE_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const addressFromBytes = getAddressDecoder();
const addressBytes = getAddressEncoder();

/** A fresh, never-funded mint address, for tests that seed exactly what they read. */
export const randomCurveMint = () =>
  addressFromBytes.decode(crypto.getRandomValues(new Uint8Array(32)));

/** 32 bytes of an address as the layouts embed them. @param {string} mint */
const mintBytes = (mint) => new Uint8Array(addressBytes.encode(address(mint)));

/**
 * Pure account map for a loopback JSON-RPC fixture: one fresh SOL-paired curve, one completed
 * curve, one USDC-paired curve — each at its own mint's derived PDA — plus the Global config
 * at its well-known address. Everything else reads as absent.
 * @param {{ readonly fresh: string; readonly completed: string; readonly unsupportedQuote: string }} mints
 * @returns {Promise<Map<string, { owner: string; data: Uint8Array }>>}
 */
export const launchFixtureAccounts = async (mints) => {
  const accounts = new Map();
  /**
   * @param {string} mint
   * @param {Uint8Array} data
   */
  const put = async (mint, data) =>
    accounts.set(await bondingCurveAddress(mint), { owner: PUMP_PROGRAM, data });
  await put(mints.fresh, freshCurveBytes());
  await put(
    mints.completed,
    freshCurveBytes({ realTokenReserves: 0n, realQuoteReserves: 0n, complete: true }),
  );
  await put(mints.unsupportedQuote, freshCurveBytes({ quoteMint: mintBytes(USDC_QUOTE_MINT) }));
  accounts.set(await globalConfigAddress(), { owner: PUMP_PROGRAM, data: globalConfigBytes() });
  return accounts;
};
