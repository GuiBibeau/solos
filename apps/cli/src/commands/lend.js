// @ts-check
import { Command, Options } from "@effect/cli";
import { executeLendDeposit, getLendPosition, getReserve, simulateLendDeposit } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const mint = Options.text("mint").pipe(
  Options.withDescription("Token mint whose reserve to read in the configured Kamino market"),
);

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription("Supply owner. Defaults to the configured signer wallet."),
);

const reserve = Command.make("reserve", { mint }, (options) =>
  withSolos(getReserve({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read supply and borrow APY plus exact available liquidity for one Kamino reserve",
  ),
);

const position = Command.make("position", { mint, owner }, (options) =>
  withSolos(
    getLendPosition({
      mint: options.mint,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read one owner's exact Kamino supply in underlying base units (read-only)",
  ),
);

const amount = Options.text("amount").pipe(
  Options.withDescription(
    "Underlying amount to supply in base units of the mint, as a positive integer string",
  ),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
);

const simulateDeposit = Command.make("simulate-deposit", { mint, amount }, (options) =>
  withSolos(
    simulateLendDeposit({
      mint: options.mint,
      amount: options.amount,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate supplying the signer's own tokens into the configured Kamino market without submitting anything: shows the reserve, the exact encoded amount, the predicted collateral and the accounts the executor would initialize",
  ),
);

const deposit = Command.make("deposit", { mint, amount, skipSimulation }, (options) =>
  withSolos(
    executeLendDeposit({
      mint: options.mint,
      amount: options.amount,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Supply the signer's own tokens to the configured Kamino market and wait for confirmation; simulates the exact transaction first, and sends nothing when simulation or validation fails (moves funds)",
  ),
);

export const lend = Command.make("lend").pipe(
  Command.withDescription(
    "Kamino lending: reserve and owner-supply reads, bounded supply deposits (simulation and execution)",
  ),
  Command.withSubcommands([reserve, position, simulateDeposit, deposit]),
);
