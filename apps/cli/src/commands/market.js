// @ts-check
import { Command, Options } from "@effect/cli";
import { askIris, askIrisTool, getPrice, getPriceTool, getToken, getTokenTool } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { news, summary, trending } from "./market-discovery.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const question = Options.text("question").pipe(optionHelp(askIrisTool.input.shape.question));

const ask = Command.make("ask", { question }, (options) =>
  withSolos(askIris({ question: options.question }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(askIrisTool));

const mint = Options.text("mint").pipe(optionHelp(getPriceTool.input.shape.mint));

const price = Command.make("price", { mint }, (options) =>
  withSolos(getPrice({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getPriceTool));

const tokenMint = Options.text("mint").pipe(optionHelp(getTokenTool.input.shape.mint));

const token = Command.make("token", { tokenMint }, (options) =>
  withSolos(getToken({ mint: options.tokenMint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getTokenTool));

export const market = Command.make("market").pipe(
  groupHelp("Market intelligence (Elfa Iris), Jupiter USD prices, and on-chain token metadata"),
  Command.withSubcommands([ask, trending, news, summary, price, token]),
);
