// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeDeposit,
  executeDepositTool,
  getLpPosition,
  getLpPositionTool,
  simulateDeposit,
  simulateDepositTool,
} from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import {
  closeCommand,
  openCommand,
  simulateCloseCommand,
  simulateOpenCommand,
} from "./liquidity-lifecycle.js";
import { simulateWithdrawCommand, withdrawCommand } from "./liquidity-withdraw.js";
import { commandHelp, groupHelp, optionHelp } from "./tool-help.js";

const readProtocol = Options.text("protocol").pipe(
  optionHelp(getLpPositionTool.input.shape.protocol),
);

const position = Options.text("position").pipe(optionHelp(getLpPositionTool.input.shape.position));

const owner = Options.text("owner").pipe(
  Options.optional,
  optionHelp(getLpPositionTool.input.shape.owner),
);

const positionCommand = Command.make(
  "position",
  { protocol: readProtocol, position, owner },
  (options) =>
    withSolos(
      getLpPosition({
        // The use case re-validates: a value outside the venue enum fails LiquidityInputInvalid.
        protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
        position: options.position,
        owner: Option.getOrUndefined(options.owner),
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(getLpPositionTool));

const wrapSol = Options.boolean("wrap-sol").pipe(
  Options.withDefault(false),
  optionHelp(simulateDepositTool.input.shape.wrapSol),
);

const depositOptions = {
  protocol: Options.text("protocol").pipe(optionHelp(simulateDepositTool.input.shape.protocol)),
  pool: Options.text("pool").pipe(optionHelp(simulateDepositTool.input.shape.pool)),
  position: Options.text("position").pipe(optionHelp(simulateDepositTool.input.shape.position)),
  amountA: Options.text("amount-a").pipe(optionHelp(simulateDepositTool.input.shape.amountA)),
  amountB: Options.text("amount-b").pipe(optionHelp(simulateDepositTool.input.shape.amountB)),
  maxSlippageBps: Options.integer("max-slippage-bps").pipe(
    Options.withDefault(50),
    optionHelp(simulateDepositTool.input.shape.maxSlippageBps),
  ),
  wrapSol,
};

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeDepositTool.input.shape.skipSimulation),
);

const simulateDepositCommand = Command.make("simulate-deposit", depositOptions, (options) =>
  withSolos(
    simulateDeposit({
      protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
      pool: options.pool,
      position: options.position,
      amountA: options.amountA,
      amountB: options.amountB,
      maxSlippageBps: options.maxSlippageBps,
      wrapSol: options.wrapSol,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(simulateDepositTool));

const depositCommand = Command.make("deposit", { ...depositOptions, skipSimulation }, (options) =>
  withSolos(
    executeDeposit({
      protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
      pool: options.pool,
      position: options.position,
      amountA: options.amountA,
      amountB: options.amountB,
      maxSlippageBps: options.maxSlippageBps,
      wrapSol: options.wrapSol,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(commandHelp(executeDepositTool));

export const liquidity = Command.make("liquidity").pipe(
  groupHelp(
    "Liquidity venues: Orca, Raydium, and Meteora position reads, deposits, and withdrawals on existing positions, and opening or closing a Raydium position at a range you choose",
  ),
  Command.withSubcommands([
    positionCommand,
    simulateDepositCommand,
    depositCommand,
    simulateWithdrawCommand,
    withdrawCommand,
    simulateOpenCommand,
    openCommand,
    simulateCloseCommand,
    closeCommand,
  ]),
);
