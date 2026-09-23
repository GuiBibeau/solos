// @ts-check
import { Command, Options } from "@effect/cli";
import {
  getPosition,
  getOnboardingStatus,
  simulateOnboardTrader,
  executeOnboardTrader,
} from "@solos/core";
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

const onboardingStatus = Command.make("onboarding-status", {}, () =>
  withSolos(getOnboardingStatus().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription("Check the current wallet's Phoenix registration and trading access"),
);

const simulateOnboard = Command.make("simulate-onboard", {}, () =>
  withSolos(simulateOnboardTrader().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription("Simulate onboarding the current wallet with Phoenix; never submit"),
);

const onboard = Command.make("onboard", {}, () =>
  withSolos(executeOnboardTrader().pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Explicitly enroll the current wallet as a Phoenix trader; does not deposit collateral",
  ),
);

export const perp = Command.make("perp").pipe(
  Command.withDescription("Phoenix Perps: positions and account enrollment"),
  Command.withSubcommands([position, onboardingStatus, simulateOnboard, onboard]),
);
