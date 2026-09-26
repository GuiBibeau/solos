// @ts-check
import { Command, Options } from "@effect/cli";
import { executeWithdraw, simulateWithdraw } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const protocol = Options.text("protocol").pipe(
  Options.withDescription(
    "Liquidity protocol. orca (Whirlpools), raydium (CLMM), and meteora (DLMM) are implemented. The wallet receives token A and token B principal. Meteora does not claim fees or rewards in this transaction.",
  ),
);

const position = Options.text("position").pipe(
  Options.withDescription(
    "Protocol position account: Whirlpool PDA, Raydium personal position, or Meteora PositionV2 (owner field). Never an NFT mint. The position is not closed and its range is not changed.",
  ),
);

const bps = Options.integer("bps").pipe(
  Options.withDescription(
    "Fraction of CURRENT liquidity to remove, 1..10000. Meteora applies it to each occupied bin. 10000 removes every share. Fractional shares round down.",
  ),
);

const maxSlippageBps = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription(
    "Price-movement tolerance in basis points, 0..9999. On-chain minimum receipts are floor(quoted principal * (10000 - tolerance) / 10000). Fees are not included. Default 50.",
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
    "Simulate removing liquidity from one existing Orca, Raydium, or Meteora position without submitting anything. The wallet would receive token A/B principal only; Meteora does not claim fees. Minimum receipts are the quotes minus slippage",
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
    "Remove liquidity from one existing Orca, Raydium, or Meteora position and wait for confirmation. The wallet receives token A/B principal; Meteora does not claim fees. Simulates the exact transaction first, and sends nothing when simulation or validation fails (moves funds)",
  ),
);
