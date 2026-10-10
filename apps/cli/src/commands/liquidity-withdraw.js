// @ts-check
import { Command, Options } from "@effect/cli";
import {
  executeWithdraw,
  executeWithdrawTool,
  simulateWithdraw,
  simulateWithdrawTool,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { commandHelp, optionHelp } from "./tool-help.js";

const protocol = Options.text("protocol").pipe(
  optionHelp(simulateWithdrawTool.input.shape.protocol),
);

const position = Options.text("position").pipe(
  optionHelp(simulateWithdrawTool.input.shape.position),
);

const bps = Options.integer("bps").pipe(optionHelp(simulateWithdrawTool.input.shape.bps));

const maxSlippageBps = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  optionHelp(simulateWithdrawTool.input.shape.maxSlippageBps),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  optionHelp(executeWithdrawTool.input.shape.skipSimulation),
);

const withdrawOptions = { protocol, position, bps, maxSlippageBps };

export const simulateWithdrawCommand = Command.make(
  "simulate-withdraw",
  withdrawOptions,
  (options) =>
    withSolos(
      simulateWithdraw({
        protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
        position: options.position,
        bps: options.bps,
        maxSlippageBps: options.maxSlippageBps,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(simulateWithdrawTool));

export const withdrawCommand = Command.make(
  "withdraw",
  { ...withdrawOptions, skipSimulation },
  (options) =>
    withSolos(
      executeWithdraw({
        protocol: /** @type {"orca" | "meteora" | "raydium"} */ (options.protocol),
        position: options.position,
        bps: options.bps,
        maxSlippageBps: options.maxSlippageBps,
        skipSimulation: options.skipSimulation,
      }).pipe(Effect.flatMap(emit)),
    ).pipe(exitOnFailure),
).pipe(commandHelp(executeWithdrawTool));
