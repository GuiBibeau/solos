// @ts-check
/**
 * Opening and closing a concentrated-liquidity position from the CLI.
 *
 * Raydium takes a tick range and spend budgets. Meteora takes lowerBinId and width and opens
 * empty. An illegal range is refused, never rounded or clamped. A meteora position pubkey is
 * on a confirmed open's result; a simulation's key is a different build and is not that account.
 */
import { Command, Options } from "@effect/cli";
import {
  executeClosePosition,
  executeOpenPosition,
  simulateClosePosition,
  simulateOpenPosition,
} from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";
import { definedOpenFields, openRangeOptions } from "./liquidity-open-options.js";

/** @typedef {"orca" | "meteora" | "raydium"} Protocol */

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. raydium (CLMM) and an empty meteora (DLMM) position can be opened and closed; orca fails before any network access.",
  ),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
);

const wrapSol = Options.boolean("wrap-sol").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Wrap exactly the native SOL the quote is short on a wSOL side, in this same transaction, and unwrap the remainder when this transaction created the account. Defaults to false.",
  ),
);

const openOptions = {
  protocol,
  pool: Options.text("pool").pipe(
    Options.withDescription("Pool address to open the position in. On meteora this is the LbPair."),
  ),
  ...openRangeOptions,
  maxSlippageBps: Options.integer("max-slippage-bps").pipe(
    Options.withDefault(50),
    Options.withDescription(
      "Raydium price-movement tolerance in basis points, 0..9999. Ignored by an empty meteora open. Default 50.",
    ),
  ),
  wrapSol,
};

/** @param {{ protocol: string; pool: string; maxSlippageBps: number; wrapSol: boolean; tickLower: import("effect").Option.Option<number>; tickUpper: import("effect").Option.Option<number>; amountA: import("effect").Option.Option<string>; amountB: import("effect").Option.Option<string>; lowerBinId: import("effect").Option.Option<number>; width: import("effect").Option.Option<number> }} options */
const openInput = (options) => ({
  protocol: /** @type {Protocol} */ (options.protocol),
  pool: options.pool,
  maxSlippageBps: options.maxSlippageBps,
  wrapSol: options.wrapSol,
  ...definedOpenFields({
    tickLower: options.tickLower,
    tickUpper: options.tickUpper,
    amountA: options.amountA,
    amountB: options.amountB,
    lowerBinId: options.lowerBinId,
    width: options.width,
  }),
});

export const simulateOpenCommand = Command.make("simulate-open", openOptions, (options) =>
  withSolos(simulateOpenPosition(openInput(options)).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(
  Command.withDescription(
    "Simulate opening a Raydium CLMM position at a tick range, or an empty Meteora DLMM position at lower-bin-id and width, without submitting anything",
  ),
);

export const openCommand = Command.make("open", { ...openOptions, skipSimulation }, (options) =>
  withSolos(
    executeOpenPosition({
      ...openInput(options),
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Open a Raydium CLMM position at a tick range, or an empty Meteora DLMM position at lower-bin-id and width, and wait for confirmation. A meteora open returns the PositionV2 pubkey. Sends nothing when simulation or validation fails (moves funds)",
  ),
);

const closeOptions = {
  protocol,
  position: Options.text("position").pipe(
    Options.withDescription(
      "Protocol position account to close. On meteora this is the PositionV2 account, never an NFT mint and never the pool.",
    ),
  ),
};

export const simulateCloseCommand = Command.make("simulate-close", closeOptions, (options) =>
  withSolos(
    simulateClosePosition({
      protocol: /** @type {Protocol} */ (options.protocol),
      position: options.position,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate closing an emptied Raydium CLMM or Meteora DLMM position without submitting anything. Meteora is refused while any liquidity share remains",
  ),
);

export const closeCommand = Command.make("close", { ...closeOptions, skipSimulation }, (options) =>
  withSolos(
    executeClosePosition({
      protocol: /** @type {Protocol} */ (options.protocol),
      position: options.position,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Close an emptied Raydium CLMM or Meteora DLMM position and reclaim its rent. Remove every liquidity share first. Sends nothing when simulation or validation fails (moves funds)",
  ),
);
