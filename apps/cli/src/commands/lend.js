// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeLendDeposit,
  executeLendDepositTool,
  executeLendWithdraw,
  executeLendWithdrawTool,
  getLendPosition,
  getLendPositionTool,
  getReserve,
  getReserveTool,
  simulateLendDeposit,
  simulateLendDepositTool,
  simulateLendWithdraw,
  simulateLendWithdrawTool,
} from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const reserveMint = Options.text("mint").pipe(optionHelp(getReserveTool.input.shape.mint));

const positionMint = Options.text("mint").pipe(optionHelp(getLendPositionTool.input.shape.mint));
const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(getLendPositionTool.input.shape.owner),
);

const reserve = Command.make("reserve", { mint: reserveMint }, (options) =>
  withSolos(getReserve({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(commandHelp(getReserveTool));

const position = Command.make("position", { mint: positionMint, owner }, (options) =>
  withSolos(
    getLendPosition({
      mint: options.mint,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(getLendPositionTool));

const depositMint = Options.text("mint").pipe(optionHelp(simulateLendDepositTool.input.shape.mint));
const depositAmount = Options.text("amount").pipe(
  optionHelp(simulateLendDepositTool.input.shape.amount),
);
const depositSkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeLendDepositTool.input.shape.skipSimulation),
);

const simulateDeposit = Command.make(
  "simulate-deposit",
  { mint: depositMint, amount: depositAmount },
  (options) =>
    withSolos(
      simulateLendDeposit({ mint: options.mint, amount: options.amount }).pipe(
        Effect.flatMap(emit),
      ),
    ).pipe(exitOnFailure),
).pipe(commandHelp(simulateLendDepositTool));

const deposit = Command.make(
  "deposit",
  { mint: depositMint, amount: depositAmount, skipSimulation: depositSkip },
  (options) =>
    withSolos(
      executeLendDeposit({
        mint: options.mint,
        amount: options.amount,
        skipSimulation: options.skipSimulation,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(executeLendDepositTool));

const withdrawMint = Options.text("mint").pipe(
  optionHelp(simulateLendWithdrawTool.input.shape.mint),
);
const withdrawAmount = Options.text("amount").pipe(
  optionHelp(simulateLendWithdrawTool.input.shape.amount),
);
const withdrawSkip = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeLendWithdrawTool.input.shape.skipSimulation),
);

const simulateWithdraw = Command.make(
  "simulate-withdraw",
  { mint: withdrawMint, amount: withdrawAmount },
  (options) =>
    withSolos(
      simulateLendWithdraw({ mint: options.mint, amount: options.amount }).pipe(
        Effect.flatMap(emit),
      ),
    ).pipe(exitOnFailure),
).pipe(commandHelp(simulateLendWithdrawTool));

const withdraw = Command.make(
  "withdraw",
  { mint: withdrawMint, amount: withdrawAmount, skipSimulation: withdrawSkip },
  (options) =>
    withSolos(
      executeLendWithdraw({
        mint: options.mint,
        amount: options.amount,
        skipSimulation: options.skipSimulation,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(executeLendWithdrawTool));

export const lend = Command.make("lend").pipe(
  groupHelp("Kamino lending: reserve and owner-supply reads, bounded deposit and withdrawal twins"),
  Command.withSubcommands([
    reserve,
    position,
    simulateDeposit,
    deposit,
    simulateWithdraw,
    withdraw,
  ]),
);
