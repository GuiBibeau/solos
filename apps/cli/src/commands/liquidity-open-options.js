// @ts-check
/**
 * Optional open flags. Raydium needs ticks and budgets; meteora needs a bin window.
 * Absent flags are omitted: an explicit undefined is kept by the schema and would then
 * be read as the other protocol's field.
 */
import { Options } from "@effect/cli";
import { Option } from "effect";

/** @param {string} name @param {string} description */
const optionalInteger = (name, description) =>
  Options.integer(name).pipe(Options.optional, Options.withDescription(description));

/** @param {string} name @param {string} description */
const optionalText = (name, description) =>
  Options.text(name).pipe(Options.optional, Options.withDescription(description));

export const openRangeOptions = {
  tickLower: optionalInteger(
    "tick-lower",
    "Raydium lower tick, inclusive. Required for raydium. An unaligned range is refused, not rounded.",
  ),
  tickUpper: optionalInteger(
    "tick-upper",
    "Raydium upper tick, exclusive. Required for raydium, and it must sit above tick-lower.",
  ),
  amountA: optionalText(
    "amount-a",
    "Raydium maximum token A spend in base units, as an integer string. Required for raydium.",
  ),
  amountB: optionalText(
    "amount-b",
    "Raydium maximum token B spend in base units, as an integer string. Required for raydium.",
  ),
  lowerBinId: optionalInteger(
    "lower-bin-id",
    "Meteora lower bin id, inclusive. Required for meteora. The caller chooses it.",
  ),
  width: optionalInteger(
    "width",
    "Meteora position width in bins, from 1 to 70. Required for meteora. Illegal widths are refused, never clamped.",
  ),
};

/** @param {Record<string, unknown>} target @param {string} key @param {unknown} value */
const assignDefined = (target, key, value) => {
  if (value !== undefined) target[key] = value;
};

/**
 * @param {Record<string, Option.Option<unknown>>} options
 * @returns {Record<string, unknown>}
 */
export const definedOpenFields = (options) => {
  /** @type {Record<string, unknown>} */
  const fields = {};
  for (const [key, value] of Object.entries(options)) {
    assignDefined(fields, key, Option.getOrUndefined(value));
  }
  return fields;
};
