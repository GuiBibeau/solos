// @ts-check
import { Command, Options } from "@effect/cli";
import {
  getPosition,
  getOnboardingStatus,
  simulateOnboardTrader,
  executeOnboardTrader,
  simulatePerpDeposit,
  executePerpDeposit,
  simulatePerpWithdrawal,
  executePerpWithdrawal,
  simulatePerpOpen,
  executePerpOpen,
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

const depositAmount = Options.text("amount").pipe(
  Options.withDescription(
    "Exact wallet USDC input in base units; received collateral is only estimated",
  ),
);
const withdrawalAmount = Options.text("amount").pipe(
  Options.withDescription(
    "Exact Phoenix collateral-token input in base units; USDC receipt is only estimated",
  ),
);

const simulateDeposit = Command.make("simulate-deposit", { amount: depositAmount }, ({ amount }) =>
  withSolos(simulatePerpDeposit({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Preview explicit USDC deposit to your Phoenix trader; no guaranteed output",
  ),
);

const deposit = Command.make("deposit", { amount: depositAmount }, ({ amount }) =>
  withSolos(executePerpDeposit({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Deposit wallet USDC into your Phoenix trader, then reconcile actual balances",
  ),
);

const simulateWithdraw = Command.make(
  "simulate-withdraw-collateral",
  { amount: withdrawalAmount },
  ({ amount }) =>
    withSolos(simulatePerpWithdrawal({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Preview explicit fixed-input Phoenix collateral withdrawal to your USDC account",
  ),
);

const withdraw = Command.make("withdraw-collateral", { amount: withdrawalAmount }, ({ amount }) =>
  withSolos(executePerpWithdrawal({ amount }).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(
  Command.withDescription(
    "Withdraw Phoenix collateral only after all-market safety checks; output is estimated",
  ),
);

const openInput = {
  market,
  side: Options.choice("side", ["long", "short"]).pipe(
    Options.withDescription("Open long (buy) or short (sell)"),
  ),
  notionalUsd: Options.text("notional-usd").pipe(
    Options.withDescription("Maximum order notional in integer 1e6 USD units"),
  ),
  maxLeverage: Options.float("max-leverage").pipe(
    Options.withDescription("Maximum leverage (1 through 100)"),
  ),
  limitPriceUsd: Options.text("limit-price-usd").pipe(
    Options.withDescription("Maximum buy or minimum sell price, decimal USD per base token"),
  ),
};

const simulateOpen = Command.make("simulate-open", openInput, (options) =>
  withSolos(simulatePerpOpen(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Preview a bounded Phoenix IOC open; never send an order"));

const open = Command.make(
  "open",
  { ...openInput, skipSimulation: Options.boolean("skip-simulation") },
  (options) => withSolos(executePerpOpen(options).pipe(Effect.flatMap(emit))).pipe(exitOnFailure),
).pipe(Command.withDescription("Submit a bounded Phoenix IOC open; confirmation is not a fill"));

export const perp = Command.make("perp").pipe(
  Command.withDescription(
    "Phoenix Perps: positions, enrollment, and explicit collateral management",
  ),
  Command.withSubcommands([
    position,
    onboardingStatus,
    simulateOnboard,
    onboard,
    simulateDeposit,
    deposit,
    simulateWithdraw,
    withdraw,
    simulateOpen,
    open,
  ]),
);
