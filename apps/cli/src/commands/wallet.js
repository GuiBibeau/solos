// @ts-check
import { Command, Options } from "@effect/cli";
import { getAddress, getBalances } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription("Wallet to inspect. Defaults to the configured signer."),
);

const balance = Command.make("balance", { owner }, (options) =>
  withSolos(getBalances(Option.getOrUndefined(options.owner)).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(Command.withDescription("SOL and token balances"));

const address = Command.make("address", {}, () =>
  withSolos(getAddress().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Address and backend of the configured signer"));

export const wallet = Command.make("wallet").pipe(
  Command.withDescription("Read wallet state"),
  Command.withSubcommands([balance, address]),
);
