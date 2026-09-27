// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeCloseTokenAccount,
  getAddress,
  getBalances,
  simulateCloseTokenAccount,
} from "@solos/core";
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

const account = Options.text("account").pipe(
  Options.withDescription(
    "Token account to close, as `wallet balance` lists it: empty, or the wrapped-SOL account",
  ),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
);

const simulateCloseAccount = Command.make("simulate-close-account", { account }, (options) =>
  withSolos(
    simulateCloseTokenAccount({ account: options.account }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Preview closing a token account: rent back, or wrapped SOL unwrapped (sends nothing)",
  ),
);

const closeAccount = Command.make("close-account", { account, skipSimulation }, (options) =>
  withSolos(
    executeCloseTokenAccount({
      account: options.account,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Close a token account: reclaim an empty account's rent, or unwrap wrapped SOL",
  ),
);

export const wallet = Command.make("wallet").pipe(
  Command.withDescription("Read wallet state, and close token accounts"),
  Command.withSubcommands([balance, address, simulateCloseAccount, closeAccount]),
);
