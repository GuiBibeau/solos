// @ts-check
import { Command, Options } from "@effect/cli";
import { executeBuy, executeSell, getCurve, simulateBuy, simulateSell } from "@solos/core";
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
const sellMint = Options.text("mint").pipe(
  Options.withDescription("Base58 mint of the coin to sell, whose bonding curve must be live"),
);
const amount = Options.text("amount").pipe(
  Options.withDescription(
    "Maximum SOL to spend in lamports, including Pump trading fees. Never a token amount",
  ),
);
const tokensIn = Options.text("amount").pipe(
  Options.withDescription(
    "Exact quantity of the coin to sell, in its base units. Never a SOL amount",
  ),
);
const maxSlippageBps = Options.integer("max-slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription("How far past the quote the enforced on-chain minimum may sit"),
);
const skipSimulation = Options.boolean("skip-simulation").pipe(
  Options.withDefault(false),
  Options.withDescription(
    "Send without simulating first. Bypasses only the simulation, never the validation or the on-chain minimum",
  ),
);

const buyOptions = { mint: buyMint, amount, maxSlippageBps };
const sellOptions = { mint: sellMint, amount: tokensIn, maxSlippageBps };

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
    "Buy a pump.fun coin with a bounded SOL budget and submit it. amount is the maximum SOL spend including Pump fees; the minimum tokens out is enforced on chain",
  ),
);

const simulateSellCommand = Command.make("simulate-sell", sellOptions, (options) =>
  withSolos(
    simulateSell({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Simulate selling a pump.fun coin back to its bonding curve without submitting anything. amount is the exact quantity of the coin in base units, never a SOL amount; the minimum SOL out is derived from live curve state and enforced on chain",
  ),
);

const sell = Command.make("sell", { ...sellOptions, skipSimulation }, (options) =>
  withSolos(
    executeSell({
      mint: options.mint,
      amount: options.amount,
      maxSlippageBps: options.maxSlippageBps,
      skipSimulation: options.skipSimulation,
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Sell a pump.fun coin back to its bonding curve and submit it. amount is the exact quantity of the coin in base units; the minimum SOL out is enforced on chain",
  ),
);

export const launch = Command.make("launch").pipe(
  Command.withDescription("Pump bonding curve reads, bounded SOL-in buys, and curve-side sells"),
  Command.withSubcommands([curve, simulateBuyCommand, buy, simulateSellCommand, sell]),
);
