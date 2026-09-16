// @ts-check
import { Command, Options } from "@effect/cli";
import { sendSol, simulateSol } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const to = Options.text("to").pipe(Options.withDescription("Recipient address"));
const amount = Options.text("amount").pipe(Options.withDescription("Amount in SOL, e.g. 0.1"));
const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDescription("Send without simulating first"),
);
const simulateOnly = Options.boolean("simulate-only").pipe(
  Options.withDescription("Build and simulate, never send"),
);

const sol = Command.make("sol", { to, amount, skipSimulation, simulateOnly }, (options) => {
  const input = {
    to: options.to,
    amountSol: options.amount,
    skipSimulation: options.skipSimulation,
  };
  const program = options.simulateOnly ? simulateSol(input) : sendSol(input);
  return withSolos(program.pipe(Effect.flatMap(emit))).pipe(exitOnFailure);
}).pipe(Command.withDescription("Send SOL from the configured signer (real funds on mainnet)"));

export const transfer = Command.make("transfer").pipe(
  Command.withDescription("Move funds"),
  Command.withSubcommands([sol]),
);
