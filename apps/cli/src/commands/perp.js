// @ts-check
import { Command, Options } from "@effect/cli";
import { getPosition } from "@solos/core";
import { Effect, Option } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const market = Options.text("market").pipe(
  Options.withDescription(
    "Perp market symbol, e.g. SOL or SOL-PERP (normalized to the exchange symbol)",
  ),
);

const owner = Options.text("owner").pipe(
  Options.optional,
  Options.withDescription("Trader address to read. Defaults to the configured signer."),
);

const position = Command.make("position", { market, owner }, (options) =>
  withSolos(
    getPosition({
      market: options.market,
      owner: Option.getOrUndefined(options.owner),
    }).pipe(Effect.flatMap(emit)),
  ).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Read one Phoenix perp position with explicit side and the trader account equity",
  ),
);

export const perp = Command.make("perp").pipe(
  Command.withDescription("Phoenix Perps: positions and account equity (reads are public)"),
  Command.withSubcommands([position]),
);
