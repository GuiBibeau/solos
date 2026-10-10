// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeCloseTokenAccount,
  executeCloseTokenAccountTool,
  getAddress,
  getAddressTool,
  getBalanceTool,
  getBalances,
  simulateCloseTokenAccount,
  simulateCloseTokenAccountTool,
} from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(getBalanceTool.input.shape.owner),
);

const balance = Command.make("balance", { owner }, (options) =>
  withSolos(getBalances(Option.getOrUndefined(options.owner)).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(commandHelp(getBalanceTool));

const address = Command.make("address", {}, () =>
  withSolos(getAddress().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getAddressTool));

const account = Options.text("account").pipe(
  optionHelp(simulateCloseTokenAccountTool.input.shape.account),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeCloseTokenAccountTool.input.shape.skipSimulation),
);

const simulateCloseAccount = Command.make("simulate-close-account", { account }, (options) =>
  withSolos(
    simulateCloseTokenAccount({ account: options.account }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateCloseTokenAccountTool));

const closeAccount = Command.make("close-account", { account, skipSimulation }, (options) =>
  withSolos(
    executeCloseTokenAccount({
      account: options.account,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(executeCloseTokenAccountTool));

export const wallet = Command.make("wallet").pipe(
  groupHelp("Read wallet state, and close token accounts"),
  Command.withSubcommands([balance, address, simulateCloseAccount, closeAccount]),
);
