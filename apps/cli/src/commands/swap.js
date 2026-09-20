// @ts-check
import { Command, Options } from "@effect/cli";
import { executeSwap, getQuote, simulateSwap } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const inputMint = Options.text("input-mint").pipe(
  Options.withDescription("Base58 mint of the token to sell, e.g. the wSOL mint"),
);

const outputMint = Options.text("output-mint").pipe(
  Options.withDescription("Base58 mint of the token to buy, e.g. the USDC mint"),
);

const amount = Options.text("amount").pipe(
  Options.withDescription("Input amount in base units of inputMint, as an exact integer string"),
);

const slippageBps = Options.integer("slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription("Max slippage in basis points. Default 50 (0.5%)."),
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
).pipe(
  Command.withDescription(
    "Get an indicative Jupiter V2 swap quote; routing pinned to Metis, nothing is sent on chain",
  ),
);

const simulate = Command.make("simulate", swapOptions, (options) =>
  withSolos(
    simulateSwap({
      inputMint: options.inputMint,
      outputMint: options.outputMint,
      amount: options.amount,
      slippageBps: options.slippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate a Jupiter swap for the configured signer without submitting anything; the fresh " +
      "build behind this simulation is never reused by a later execute",
  ),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
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
).pipe(
  Command.withDescription(
    "Execute a Jupiter swap from the configured signer and wait for confirmation. Fetches a " +
      "fresh build for this call — earlier quote or simulate output is never reused — simulates " +
      "the exact transaction first, and sends nothing when validation or simulation fails",
  ),
);

export const swap = Command.make("swap").pipe(
  Command.withDescription(
    "Jupiter V2 swap quotes plus simulation and execution through the ActionExecutor (execution " +
      "moves funds; every execute fetches a fresh build)",
  ),
  Command.withSubcommands([quote, simulate, execute]),
);
