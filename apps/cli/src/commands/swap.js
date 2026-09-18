// @ts-check
import { Command, Options } from "@effect/cli";
import { getQuote } from "@solos/core";
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

const quote = Command.make("quote", { inputMint, outputMint, amount, slippageBps }, (options) =>
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

export const swap = Command.make("swap").pipe(
  Command.withDescription("Indicative Jupiter V2 swap quotes (read-only, no send path)"),
  Command.withSubcommands([quote]),
);
