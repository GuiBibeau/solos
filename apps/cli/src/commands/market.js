// @ts-check
import { Command, Options } from "@effect/cli";
import { askIris } from "@solos/core";
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

export const market = Command.make("market").pipe(
  Command.withDescription("Market intelligence (Elfa Iris)"),
  Command.withSubcommands([ask, trending, news, summary]),
);
