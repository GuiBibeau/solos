// @ts-check
import { Command, Options } from "@effect/cli";
import { getCurve } from "@solos/core";
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

export const launch = Command.make("launch").pipe(
  Command.withDescription("Pump bonding curve reads (read-only, no trading path)"),
  Command.withSubcommands([curve]),
);
