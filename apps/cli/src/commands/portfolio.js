// @ts-check
import { Command, Options } from "@effect/cli";
import { getState } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription("Owner to read. Defaults to the configured signer's address."),
);

const state = Command.make("state", { owner }, (options) =>
  withSolos(
    getState({ owner: Option.getOrUndefined(options.owner) }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read the supported-portfolio state: cash, token/lend/LP/perp positions, perp account " +
      "equity and USD valuation when every nonzero holding is priced",
  ),
);

export const portfolio = Command.make("portfolio").pipe(
  Command.withDescription("Supported-portfolio read model: cash, positions and perp equity"),
  Command.withSubcommands([state]),
);
