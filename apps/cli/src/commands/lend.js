// @ts-check
import { Command, Options } from "@effect/cli";
import { getLendPosition, getReserve } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const mint = Options.text("mint").pipe(
  Options.withDescription("Token mint whose reserve to read in the configured Kamino market"),
);

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription("Supply owner. Defaults to the configured signer wallet."),
);

const reserve = Command.make("reserve", { mint }, (options) =>
  withSolos(getReserve({ mint: options.mint }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read supply and borrow APY plus exact available liquidity for one Kamino reserve",
  ),
);

const position = Command.make("position", { mint, owner }, (options) =>
  withSolos(
    getLendPosition({
      mint: options.mint,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read one owner's exact Kamino supply in underlying base units (read-only)",
  ),
);

export const lend = Command.make("lend").pipe(
  Command.withDescription("Kamino lending reserve and owner supply reads (read-only)"),
  Command.withSubcommands([reserve, position]),
);
