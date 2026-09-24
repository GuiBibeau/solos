// @ts-check
import { Command, Options } from "@effect/cli";
import { Effect } from "effect";
import { emit, exitOnFailure } from "../output.js";
import { runSwapQa } from "../qa/swap.js";

const amountSol = Options.text("amount-sol").pipe(
  Options.withDefault("0.01"),
  Options.withDescription("Round size in SOL; the token-input leg is scaled to match"),
);
const rounds = Options.integer("rounds").pipe(
  Options.withDefault(5),
  Options.withDescription("Attempts per pair. Reliability is a rate, so one attempt proves little"),
);
const slippageBps = Options.integer("slippage-bps").pipe(
  Options.withDefault(50),
  Options.withDescription("Max slippage in basis points. Default 50 (0.5%)."),
);
const threshold = Options.text("threshold").pipe(
  Options.withDefault("0.9"),
  Options.withDescription("Minimum overall success rate for a passing run"),
);
const execute = Options.boolean("execute").pipe(
  Options.withDescription(
    "Send real transactions instead of simulating. Spends real funds; authorised rounds only",
  ),
);

/** @param {string} sol */
const toLamports = (sol) => BigInt(Math.round(Number(sol) * 1_000_000_000));

const swap = Command.make("swap", { amountSol, rounds, slippageBps, threshold, execute }, (o) =>
  Effect.promise(() =>
    runSwapQa({
      tier: o.execute ? "execute" : "simulate",
      amountLamports: toLamports(o.amountSol),
      slippageBps: o.slippageBps,
      rounds: o.rounds,
      threshold: Number(o.threshold),
    }),
  )
    .pipe(
      Effect.tap((report) =>
        Effect.sync(() => {
          if (report.status !== "passed") process.exitCode = 1;
        }),
      ),
      Effect.flatMap(emit),
    )
    .pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Measure swap reliability and latency across real pairs; simulates unless --execute",
  ),
);

export const qa = Command.make("qa").pipe(
  Command.withDescription("Live quality checks that put a number on a capability"),
  Command.withSubcommands([swap]),
);
