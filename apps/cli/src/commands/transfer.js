// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeSolTool,
  sendSol,
  simulateSol,
  simulateSolTool,
  transferLamports,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, modeHelp, optionHelp } from "./tool-help.js";

const to = Options.text("to").pipe(optionHelp(executeSolTool.input.shape.to));
const amount = Options.text("amount").pipe(optionHelp(executeSolTool.input.shape.amountSol));
const skipSimulation = Options.boolean("skip-simulation").pipe(
  optionHelp(executeSolTool.input.shape.skipSimulation),
);
// One command dispatches to either tool. The flag is not a tool argument; its help is the
// simulate tool's title.
const simulateOnly = Options.boolean("simulate-only").pipe(modeHelp(simulateSolTool));

const sol = Command.make("sol", { to, amount, skipSimulation, simulateOnly }, (options) => {
  const input = {
    to: options.to,
    amountSol: options.amount,
    skipSimulation: options.skipSimulation,
  };
  // Amount validation precedes the tool Layer: Effect builds supplied Layers before the program
  // body runs, so a bad amount must fail outside `withSolos`, before any signer is loaded.
  const validAmount = Effect.try({
    try: () => transferLamports(input.amountSol),
    catch: (error) => /** @type {import("@solos/core").ValidationError} */ (error),
  });
  const program = (options.simulateOnly ? simulateSol(input) : sendSol(input)).pipe(
    Effect.flatMap(emit),
  );
  return validAmount.pipe(
    Effect.andThen(() => withSolos(program)),
    exitOnFailure,
  );
}).pipe(commandHelp(executeSolTool));

export const transfer = Command.make("transfer").pipe(
  groupHelp("Move funds"),
  Command.withSubcommands([sol]),
);
