// @ts-check
import { Command, Options } from "@effect/cli";
import { executeWithdraw, simulateWithdraw } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. Only orca (Whirlpools) is implemented; meteora and raydium fail before any network access.",
  ),
);

const position = Options.text("position").pipe(
  Options.withDescription(
    "Protocol position-account address (the Whirlpool position PDA); the position is never closed and its NFT is never burned.",
  ),
);

const bps = Options.integer("bps").pipe(
  Options.withDescription(
    "Percentage of the position's CURRENT liquidity to remove, 1..10000, where 10000 removes all of it; fractional units round down.",
  ),
);

const maxSlippageBps = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription(
    "Price-movement tolerance in basis points, 0..9999. The on-chain minimum receipts are the quoted amounts minus this tolerance. Default 50.",
  ),
);

const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Skip the pre-send simulation of the exact transaction. Defaults to false.",
  ),
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
).pipe(
  Command.withDescription(
    "Simulate removing a percentage of one existing Orca position's liquidity without submitting anything; minimum receipts are the quotes minus slippage",
  ),
);

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
).pipe(
  Command.withDescription(
    "Remove a percentage of one existing Orca position's liquidity and wait for confirmation; simulates the exact transaction first, and sends nothing when simulation or validation fails (moves funds)",
  ),
);
