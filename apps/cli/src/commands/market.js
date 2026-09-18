// @ts-check
import { Command, Options } from "@effect/cli";
import { askIris, getPrice, getToken } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { news, summary, trending } from "./market-discovery.js";

const question = Options.text("question").pipe(
  Options.withDescription("One market question, e.g. what changed for SOL in the last 24 hours"),
);

const ask = Command.make("ask", { question }, (options) =>
  withSolos(askIris({ question: options.question }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Ask Iris for market intelligence on one question; consumes Elfa API credits",
  ),
);

const mint = Options.text("mint").pipe(
  Options.withDescription("Base58 token mint address to price in USD, e.g. the wSOL mint"),
);

const price = Command.make("price", { mint }, (options) =>
  withSolos(getPrice({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Get the current USD price of one mint from Jupiter's price feed"));

const tokenMint = Options.text("mint").pipe(
  Options.withDescription("Base58 token mint address to describe, e.g. the wSOL mint"),
);

const token = Command.make("token", { tokenMint }, (options) =>
  withSolos(getToken({ mint: options.tokenMint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read verified on-chain metadata for one mint: name, symbol, decimals, logoUri",
  ),
);

export const market = Command.make("market").pipe(
  Command.withDescription(
    "Market intelligence (Elfa Iris), Jupiter USD prices, and on-chain token metadata",
  ),
  Command.withSubcommands([ask, trending, news, summary, price, token]),
);
