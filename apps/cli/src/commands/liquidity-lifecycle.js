// @ts-check
/**
 * Opening and closing a concentrated-liquidity position from the CLI.
 *
 * Raydium takes a tick range and spend budgets. Meteora takes lowerBinId and width and opens
 * empty. An illegal range is refused, never rounded or clamped. A meteora position pubkey is
 * on a confirmed open's result; a simulation's key is a different build and is not that account.
 */
import { Command, Options } from "@effect/cli";
import {
  executeClosePosition,
  executeClosePositionTool,
  executeOpenPosition,
  executeOpenPositionTool,
  simulateClosePosition,
  simulateClosePositionTool,
  simulateOpenPosition,
  simulateOpenPositionTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { definedOpenFields, openRangeOptions } from "./liquidity-open-options.js";
import { commandHelp, optionHelp } from "./tool-help.js";

/** @typedef {"orca" | "meteora" | "raydium"} Protocol */

const protocol = Options.text("protocol").pipe(
  optionHelp(simulateOpenPositionTool.input.shape.protocol),
);

const openSkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeOpenPositionTool.input.shape.skipSimulation),
);
const closeSkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeClosePositionTool.input.shape.skipSimulation),
);

const wrapSol = Options.boolean("wrap-sol").pipe(
  Options.withDefault(false),
  optionHelp(simulateOpenPositionTool.input.shape.wrapSol),
);

const openOptions = {
  protocol,
  pool: Options.text("pool").pipe(optionHelp(simulateOpenPositionTool.input.shape.pool)),
  ...openRangeOptions,
  maxSlippageBps: Options.integer("max-slippage-bps").pipe(
    Options.withDefault(50),
    optionHelp(simulateOpenPositionTool.input.shape.maxSlippageBps),
  ),
  wrapSol,
};

/** @param {{ protocol: string; pool: string; maxSlippageBps: number; wrapSol: boolean; tickLower: import("effect").Option.Option<number>; tickUpper: import("effect").Option.Option<number>; amountA: import("effect").Option.Option<string>; amountB: import("effect").Option.Option<string>; lowerBinId: import("effect").Option.Option<number>; width: import("effect").Option.Option<number> }} options */
const openInput = (options) => ({
  protocol: /** @type {Protocol} */ (options.protocol),
  pool: options.pool,
  maxSlippageBps: options.maxSlippageBps,
  wrapSol: options.wrapSol,
  ...definedOpenFields({
    tickLower: options.tickLower,
    tickUpper: options.tickUpper,
    amountA: options.amountA,
    amountB: options.amountB,
    lowerBinId: options.lowerBinId,
    width: options.width,
  }),
});

export const simulateOpenCommand = Command.make("simulate-open", openOptions, (options) =>
  withSolos(simulateOpenPosition(openInput(options)).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(commandHelp(simulateOpenPositionTool));

export const openCommand = Command.make(
  "open",
  { ...openOptions, skipSimulation: openSkip },
  (options) =>
    withSolos(
      executeOpenPosition({
        ...openInput(options),
        skipSimulation: options.skipSimulation,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(executeOpenPositionTool));

const closeOptions = {
  protocol: Options.text("protocol").pipe(
    optionHelp(simulateClosePositionTool.input.shape.protocol),
  ),
  position: Options.text("position").pipe(
    optionHelp(simulateClosePositionTool.input.shape.position),
  ),
};

export const simulateCloseCommand = Command.make("simulate-close", closeOptions, (options) =>
  withSolos(
    simulateClosePosition({
      protocol: /** @type {Protocol} */ (options.protocol),
      position: options.position,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateClosePositionTool));

export const closeCommand = Command.make(
  "close",
  { ...closeOptions, skipSimulation: closeSkip },
  (options) =>
    withSolos(
      executeClosePosition({
        protocol: /** @type {Protocol} */ (options.protocol),
        position: options.position,
        skipSimulation: options.skipSimulation,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(executeClosePositionTool));
