// @ts-check
import { PerpInputInvalid } from "./errors.js";

const GRAMMAR = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const REASON =
  "market must be an exchange symbol like SOL or SOL-PERP: alphanumerics separated by dashes";

/**
 * Normalize a user-supplied market symbol to the wire form Phoenix Perps actually trades.
 * Wire symbols are bare uppercase tickers ("SOL"); "SOL-PERP" 404s on the wire, so one
 * trailing "-PERP" alias is stripped. Existence is checked against exchange metadata by the
 * adapter — this is grammar only. Throws `PerpInputInvalid` so the tool's pure check hook and
 * the use case fail with the same tagged error before any I/O.
 * @param {string} text
 * @returns {string} the candidate wire symbol, e.g. "SOL"
 */
export const normalizeMarketSymbol = (text) => {
  const trimmed = text.trim().toUpperCase();
  if (!GRAMMAR.test(trimmed)) throw new PerpInputInvalid({ reason: REASON });
  // The alias keeps its dash, so the result is never empty here.
  return trimmed.replace(/-PERP$/, "");
};
