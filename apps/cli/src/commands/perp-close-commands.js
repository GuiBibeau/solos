// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executePerpClose,
  executePerpCloseTool,
  simulatePerpClose,
  simulatePerpCloseTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, optionHelp } from "./tool-help.js";

const input = {
  market: Options.text("market").pipe(optionHelp(simulatePerpCloseTool.input.shape.market)),
  limitPriceUsd: Options.text("limit-price-usd").pipe(
    optionHelp(simulatePerpCloseTool.input.shape.limitPriceUsd),
  ),
};

export const simulateClose = Command.make("simulate-close", input, (options) =>
  withSolos(simulatePerpClose(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(simulatePerpCloseTool));

export const close = Command.make(
  "close",
  { ...input, skipSimulation: Options.boolean("skip-simulation") },
  (options) => withSolos(executePerpClose(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(executePerpCloseTool));
