// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeBuy,
  executeBuyTool,
  executeSell,
  executeSellTool,
  getCurve,
  getCurveTool,
  simulateBuy,
  simulateBuyTool,
  simulateSell,
  simulateSellTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const curveMint = Options.text("mint").pipe(optionHelp(getCurveTool.input.shape.mint));

const curve = Command.make("curve", { mint: curveMint }, ({ mint }) =>
  withSolos(getCurve({ mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getCurveTool));

const buyMint = Options.text("mint").pipe(optionHelp(simulateBuyTool.input.shape.mint));
const sellMint = Options.text("mint").pipe(optionHelp(simulateSellTool.input.shape.mint));
const buyAmount = Options.text("amount").pipe(optionHelp(simulateBuyTool.input.shape.amount));
const sellAmount = Options.text("amount").pipe(optionHelp(simulateSellTool.input.shape.amount));
const buySlippage = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  optionHelp(simulateBuyTool.input.shape.maxSlippageBps),
);
const sellSlippage = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  optionHelp(simulateSellTool.input.shape.maxSlippageBps),
);
const buySkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeBuyTool.input.shape.skipSimulation),
);
const sellSkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeSellTool.input.shape.skipSimulation),
);

const buyOptions = { mint: buyMint, amount: buyAmount, maxSlippageBps: buySlippage };
const sellOptions = { mint: sellMint, amount: sellAmount, maxSlippageBps: sellSlippage };

const simulateBuyCommand = Command.make("simulate-buy", buyOptions, (options) =>
  withSolos(
    simulateBuy({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateBuyTool));

const buy = Command.make("buy", { ...buyOptions, skipSimulation: buySkip }, (options) =>
  withSolos(
    executeBuy({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(executeBuyTool));

const simulateSellCommand = Command.make("simulate-sell", sellOptions, (options) =>
  withSolos(
    simulateSell({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateSellTool));

const sell = Command.make("sell", { ...sellOptions, skipSimulation: sellSkip }, (options) =>
  withSolos(
    executeSell({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(executeSellTool));

export const launch = Command.make("launch").pipe(
  groupHelp("Pump bonding curve reads, bounded SOL-in buys, and curve-side sells"),
  Command.withSubcommands([curve, simulateBuyCommand, buy, simulateSellCommand, sell]),
);
