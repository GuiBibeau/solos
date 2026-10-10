// @ts-check
/**
 * Optional open flags. Raydium needs ticks and budgets; meteora needs a bin window.
 * Absent flags are omitted: an explicit undefined is kept by the schema and would then
 * be read as the other protocol's field. Help text is the open tool's argument description.
 */
import { Options } from "@effect/cli";
import { simulateOpenPositionTool } from "@solos/core";
import { Option } from "effect";
import { optionHelp } from "./tool-help.js";

/** @param {string} name */
const optionalInteger = (name) => Options.integer(name).pipe(Options.optional);

/** @param {string} name */
const optionalText = (name) => Options.text(name).pipe(Options.optional);

export const openRangeOptions = {
  tickLower: optionalInteger("tick-lower").pipe(
    optionHelp(simulateOpenPositionTool.input.shape.tickLower),
  ),
  tickUpper: optionalInteger("tick-upper").pipe(
    optionHelp(simulateOpenPositionTool.input.shape.tickUpper),
  ),
  amountA: optionalText("amount-a").pipe(optionHelp(simulateOpenPositionTool.input.shape.amountA)),
  amountB: optionalText("amount-b").pipe(optionHelp(simulateOpenPositionTool.input.shape.amountB)),
  lowerBinId: optionalInteger("lower-bin-id").pipe(
    optionHelp(simulateOpenPositionTool.input.shape.lowerBinId),
  ),
  width: optionalInteger("width").pipe(optionHelp(simulateOpenPositionTool.input.shape.width)),
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
