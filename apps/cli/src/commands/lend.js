// @ts-check
import { Command, Options } from "@effect/cli";
import { getReserve } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const mint = Options.text("mint").pipe(
  Options.withDescription("Token mint whose reserve to read in the configured Kamino market"),
);

const reserve = Command.make("reserve", { mint }, (options) =>
  withSolos(getReserve({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read supply and borrow APY plus exact available liquidity for one Kamino reserve",
  ),
);

export const lend = Command.make("lend").pipe(
  Command.withDescription("Kamino lending reserve reads (read-only)"),
  Command.withSubcommands([reserve]),
);
