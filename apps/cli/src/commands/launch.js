// @ts-check
import { Command, Options } from "@effect/cli";
import { executeBuy, getCurve, simulateBuy } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const mint = Options.text("mint").pipe(
  Options.withDescription("Base58 mint of the launched token whose bonding curve to read"),
);

const curve = Command.make("curve", { mint }, ({ mint }) =>
  withSolos(getCurve({ mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read one pump.fun bonding curve's state: complete flag, progress in basis points (floored), virtual SOL and token reserves. Read-only; SOL-paired curves only; complete does not prove a PumpSwap pool exists",
  ),
);

const buyMint = Options.text("mint").pipe(
  Options.withDescription("Base58 mint of the coin to buy, whose bonding curve must be live"),
);
const amount = Options.text("amount").pipe(
  Options.withDescription(
    "Maximum SOL to spend in lamports, including Pump trading fees. Never a token amount",
  ),
);
const maxSlippageBps = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription("How far below the quoted tokens the enforced minimum may sit"),
);
const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Send without simulating first. Bypasses only the simulation, never the validation or the on-chain minimum",
  ),
);

const buyOptions = { mint: buyMint, amount, maxSlippageBps };

const simulateBuyCommand = Command.make("simulate-buy", buyOptions, (options) =>
  withSolos(
    simulateBuy({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate a bounded-SOL pump.fun buy without submitting anything. amount is the maximum SOL spend including Pump fees, never a token amount; the minimum tokens out is derived from live curve state and enforced on chain",
  ),
);

const buy = Command.make("buy", { ...buyOptions, skipSimulation }, (options) =>
  withSolos(
    executeBuy({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Buy a pump.fun coin with a bounded SOL budget and submit it. There is no solOS Pump sell tool, so only spend here with a checked external exit route",
  ),
);

export const launch = Command.make("launch").pipe(
  Command.withDescription("Pump bonding curve reads and bounded SOL-in buys (no sell path)"),
  Command.withSubcommands([curve, simulateBuyCommand, buy]),
);
