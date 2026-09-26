// @ts-check
/**
 * Opening and closing a concentrated-liquidity position from the CLI.
 *
 * The tick range is typed by the caller and passed through untouched: an unaligned range is
 * refused, never rounded, because rounding it would open a different position than the one asked
 * for. The new position's address is not printed by a simulation — the NFT mint is generated per
 * build, so only a confirmed open has one worth reading back.
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

/** @typedef {"orca" | "meteora" | "raydium"} Protocol */

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. raydium (CLMM) is implemented for opening and closing; others fail before any network access.",
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
  pool: Options.text("pool").pipe(Options.withDescription("Pool address to open the position in.")),
  tickLower: Options.integer("tick-lower").pipe(
    Options.withDescription(
      "Lower tick, inclusive. Must be a multiple of the pool's tick spacing; an unaligned range is refused, not rounded.",
    ),
  ),
  tickUpper: Options.integer("tick-upper").pipe(
    Options.withDescription(
      "Upper tick, exclusive. Must be a multiple of the pool's tick spacing and above tick-lower.",
    ),
  ),
  amountA: Options.text("amount-a").pipe(
    Options.withDescription(
      "Maximum token A spend in base units of the pool's canonical token A mint, as an integer string; unused funds stay in the wallet.",
    ),
  ),
  amountB: Options.text("amount-b").pipe(
    Options.withDescription(
      "Maximum token B spend in base units of the pool's canonical token B mint, as an integer string; unused funds stay in the wallet.",
    ),
  ),
  maxSlippageBps: Options.integer("max-slippage-bps").pipe(
    Options.withDefault(50),
    Options.withDescription(
      "Price-movement tolerance in basis points, 0..9999. The budgets are the on-chain spend bounds. Default 50.",
    ),
  ),
  wrapSol,
};

/** @param {{ [K in keyof typeof openOptions]: any }} options */
const openInput = (options) => ({
  protocol: /** @type {Protocol} */ (options.protocol),
  pool: options.pool,
  tickLower: options.tickLower,
  tickUpper: options.tickUpper,
  amountA: options.amountA,
  amountB: options.amountB,
  maxSlippageBps: options.maxSlippageBps,
  wrapSol: options.wrapSol,
});

export const simulateOpenCommand = Command.make("simulate-open", openOptions, (options) =>
  withSolos(simulateOpenPosition(openInput(options)).pipe(Effect.flatMap(emit))).pipe(
    exitOnFailure,
  ),
).pipe(
  Command.withDescription(
    "Simulate opening a new Raydium CLMM position at the given tick range without submitting anything; the quote carries the range, the liquidity the budgets buy and the encoded spend bounds",
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
    "Open a new Raydium CLMM position at the given tick range and wait for confirmation; mints a fresh position NFT and locks rent for it, and sends nothing when simulation or validation fails (moves funds)",
  ),
);

const closeOptions = {
  protocol,
  position: Options.text("position").pipe(
    Options.withDescription(
      "Protocol position account to close, never the NFT mint and never the pool.",
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
    "Simulate closing an emptied Raydium CLMM position without submitting anything; refused while the position still holds liquidity",
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
    "Close an emptied Raydium CLMM position, burn its NFT and reclaim its rent; remove all liquidity first — a full removal also sweeps fees and rewards (moves funds)",
  ),
);
