// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeSwap,
  executeSwapTool,
  getQuote,
  getQuoteTool,
  simulateSwap,
  simulateSwapTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const inputMint = Options.text("input-mint").pipe(optionHelp(getQuoteTool.input.shape.inputMint));

const outputMint = Options.text("output-mint").pipe(
  optionHelp(getQuoteTool.input.shape.outputMint),
);

const amount = Options.text("amount").pipe(optionHelp(getQuoteTool.input.shape.amount));

const slippageBps = Options.integer("slippage-bps").pipe(
  Options.withDefault(50),
  optionHelp(getQuoteTool.input.shape.slippageBps),
);

const swapOptions = { inputMint, outputMint, amount, slippageBps };

const quote = Command.make("quote", swapOptions, (options) =>
  withSolos(
    getQuote({
      inputMint: options.inputMint,
      outputMint: options.outputMint,
      amount: options.amount,
      slippageBps: options.slippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(getQuoteTool));

const simulate = Command.make("simulate", swapOptions, (options) =>
  withSolos(
    simulateSwap({
      inputMint: options.inputMint,
      outputMint: options.outputMint,
      amount: options.amount,
      slippageBps: options.slippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateSwapTool));

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeSwapTool.input.shape.skipSimulation),
);

const execute = Command.make("execute", { ...swapOptions, skipSimulation }, (options) =>
  withSolos(
    executeSwap({
      inputMint: options.inputMint,
      outputMint: options.outputMint,
      amount: options.amount,
      slippageBps: options.slippageBps,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(executeSwapTool));

export const swap = Command.make("swap").pipe(
  groupHelp(
    "Jupiter V2 swap quotes plus simulation and execution through the ActionExecutor (execution moves funds; every execute fetches a fresh build)",
  ),
  Command.withSubcommands([quote, simulate, execute]),
);
