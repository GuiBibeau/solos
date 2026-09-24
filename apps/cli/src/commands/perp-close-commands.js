// @ts-check
import { Command, Options } from "@effect/cli";
import { executePerpClose, simulatePerpClose } from "@solos/core";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { withSolos } from "../runtime.js";

const input = {
  market: Options.text("market").pipe(
    Options.withDescription("Perp market symbol, e.g. SOL or SOL-PERP"),
  ),
  limitPriceUsd: Options.text("limit-price-usd").pipe(
    Options.withDescription("Minimum sell or maximum buy price, decimal USD per base token"),
  ),
};

export const simulateClose = Command.make("simulate-close", input, (options) =>
  withSolos(simulatePerpClose(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Preview a reduce-only Phoenix IOC close without submitting"));

export const close = Command.make(
  "close",
  { ...input, skipSimulation: Options.boolean("skip-simulation") },
  (options) => withSolos(executePerpClose(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Submit a reduce-only Phoenix IOC close; read residual position"));
